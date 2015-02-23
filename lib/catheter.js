'use strict';

var plet = require('./platelets.js');

// global properties that are shared between arteries and pulses
// n == name, d == default value, i == true to inherit value from parent, l == lowest numeric value, h == highest numeric value, r == restrict to values
var dfltType = 'async';
var sprops = [
    { n: 'type', d: dfltType, i: true, r: [dfltType, 'sync', 'fork', 'spawn', 'exec'] },
    { n: 'repeat', d: 1, l: 1 },
    { n: 'count', d: 0 },
    { n: 'id' }
];

var cat = module.exports = catheter;
cat.Artery = Artery;
cat.Pulse = Pulse;
cat.assertlet = assertlet;
cat.pulselet = pulselet;
cat.arterylet = arterylet;

/**
 * Generates a reusable I.V. that is capable of pumping meds (aka pulse events) through a pulse emitter
 * 
 * @see {@link PulseEmitter}
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Object} opts the pulse emitter's options
 * @arg {Array} [args] the arguments that will be passed to listeners via emit
 * @returns {Array} an I.V. array with corresponding catheter functions
 */
function catheter(pw, opts, args) {
    var iv = [];
    iv.dripCount = 0;
    iv.count = 1;
    iv.repeat = 1;
    iv.meds = [];
    iv.hasEnd = false;
    iv.ended = false;
    iv.emitted = [];
    iv.drained = [];
    iv.args = args;
    iv.artery = null;
    iv.data = [];
    
    /**
     * Pumps pulse events (aka meds) through the pulse emitter
     * 
     * @see {@link PulseEmitter#pump}
     * @arg {(Array | Object)} meds the pulse events
     * @arg {Boolean} begin true to begin emission
     * @returns {Array} the I.V. array
     */
    iv.pump = function pump(meds, begin) {
        if (iv.length) {
            return iv.drain();
        }
        plet.merge(iv, artery(iv, meds), true);
        meds = Array.isArray(meds) ? meds : meds.events;
        for (var i = 0, l = meds.length; i < l; i++) {
            valve(pw, iv, opts, meds[i]);
        }
        if (iv.length) {
            valve(pw, iv, opts, opts.endEvent);
            if (begin) {
                emits(pw, iv, 0);
            }
        }
        return iv;
    };
    
    /**
     * Drains pending pulse events from being emitted (will not drain currently running async events)
     * Subsequently, continues pumping any remaining pulse events left in the artery once it's drained  
     * 
     * @arg {Object} drip the optional I.V. drip created during a pump that contains pulse event data
     *        (omit will drains all pending pulse events except for async pulses)
     */
    iv.drain = function drain(drip) {
        var drips = iv, isEnd = false, isLast = false;
        if (drip) {
            drip.cbCount++;
            drips = (isEnd = drip.pulse.event === opts.endEvent) ? iv : drip.cbCount < drip.pulse.repeat ? [] : [drip];
            iv.drained.push(drip.pulse.event);
            iv.count += isEnd ? 1 : 0;
        }
        var l = drips.length;
        if (l) {
            for (var i = 0; i < l; i++) {
                pw.removeListener(drips[i].pulse.event, drips[i].callback);
            }
            drips.length = 0;
        }
        isLast = iv.drained.length >= iv.dripCount;
        if (!isEnd && isLast) {
            if (iv.count < iv.repeat) { // rinse/repeat
                iv.count++;
                for (var i = iv.length = 0, l = iv.meds.length; i < l; i++) {
                    valve(pw, iv, opts, iv.meds[i]);
                }
                emits(pw, iv, 0);
            } else if (!iv.ended) { // ensure end event is emitted
                iv.ended = true;
                emit(pw, iv, driplet(pw, iv, opts.endEvent, opts.endEvent));
            }
        } else if (!isLast) { // start emitting next queued pulse(s)
            for (var ci = iv.indexOf(drip), i = ci, x = -1; iv[i]; i += x) {
                //console.dir({ iv: iv[i], i: i, x: x, ci: ci });
                if (iv[i].cbCount < iv[i].pulse.repeat) {
                    if (iv[i].type === 'async') return; // need to wait for pending async callbacks
                    return emit(pw, iv, iv[i]); // start emitting next in line
                } else if (i === 0 && x < 0) { // look at next emmited event
                    i = ci;
                    x = 1;
                }
            }
        }
    };
    
    return iv;
};

/**
 * Artery that will span the life of the catheter
 * 
 * @class Artery
 */
function Artery() {
}

/**
 * Generates an artery or sets properties an artery when the I.V. artery already exists
 * 
 * @private
 * @arg {Array} iv the I.V. catheter
 * @arg {Array} meds the pulse events
 * @returns {Artery} the artery
 */
function artery(iv, meds) {
    if (!iv.artery) {
        iv.artery = new Artery();
    }
    plet.props(iv.artery, sprops, meds || iv, true);
    iv.artery.count = iv.count;
    iv.artery.data = iv.data;
    return iv.artery;
}

/**
 * Pulse event passed to listeners
 *
 * @private
 * @class Pulse
 * @arg {Object} the drip
 */
function Pulse(drip) {
    plet.props(this, sprops, drip.pulse, true, true);
    this.count = drip.cbCount + 1;
    this.event = drip.pulse.event;
}

/**
 * Asserts that all of the properties shared between arteries and pulses are equivalent between two arteries or pulses
 * 
 * @arg {Object} obj object that contains artery/pulse properties
 * @arg {Object} other another object that contains artery/pulse properties
 * @arg {String} [objName=1st] a name to use for the obj object when assertion fails
 * @arg {String} [otherName=2nd] a name to use for the obj object when assertion fails
 */
function assertlet(obj, other, objName, otherName) {
    plet.props(obj, sprops, other, false, false, objName || '1st', otherName || '2nd');
}

/**
 * Adds artery property values to a destination object
 * 
 * @arg {Object} dest the object to add the properties to that are shared between arteries and pulses
 * @returns {Object} the passed destination object
 */ 
function arterylet(dest) {
    return plet.props(dest, sprops);
}

/**
 * Adds or creates an object with pulse-like properties
 * 
 * @arg {Object} artery the artery object that will be used to inherit from for shared pulse property values that have not been set on the event
 * @arg {(Object | String)} event either an object that contains pulse properties or a string representing the event name
 * @arg {String} endEvent the name of the event that will be fired when the artery has completed execution
 * @returns {Object} an object that represents a pulse (not an instance of the actual pulse used during emission)
 */
function pulselet(artery, event, endEvent) {
    return driplet(null, artery, event, endEvent).pulse;
}

/**
 * Universal emission of I.V. drips that will pass a artery object and a pulse object followed by any I.V. arguments into the emitter
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {Object} drip the drip that contains pulse event data
 */
function emit(pw, iv, drip) {
    artery(iv); // tamper proof artery (needs to be the same instance as one passed to listeners- drop IE 9 support can use getters)
    var pulse = new Pulse(drip), m = drip.pulse.type === 'async' ? pw.emitAsync : pw.emit;
    iv.emitted.push(pulse);
    if (iv.args && iv.args.length) {
        m.apply(pw, [pulse.event, iv.artery, pulse].concat(iv.args));
    } else {
        m.call(pw, pulse.event, iv.artery, pulse);
    }
}

/**
 * When the event at the specified index is not async and has not been called back, the event for the passed index will be emitted
 * Also, if the pulse event is async, events are consecutively emitted until a sync event is encountered
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {Integer} i the pulse event index to start from in the I.V.
 */
function emits(pw, iv, i) {
    for (var ci = i, a; iv[ci] && (ci === i || (iv[ci].cbCount < iv[ci].repeat && iv[ci].type === 'async')); ci++) {
        emit(pw, iv, iv[ci]);
    }
}

/**
 * Creates a drip for an I.V. catheter
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {(String | Object)} evt the pulse event
 * @arg {String} the end event
 * @returns {Object} the drip / pulse
 */
function driplet(pw, iv, evt, endEvent) {
    var ieo = typeof evt === 'object', eo = ieo ? evt : null, pulse = { event: ieo ? evt.event : evt };
    if (!pulse.event) throw new Error('Event is required');
    //if (pulse.event === endEvent) pulse.type = dfltType; // end event should always be async
    if (eo && eo.id) pulse.id = eo.id; // IDs are not inherited because iv/pulse IDs are non-transferable
    pulse = plet.props(plet.props(pulse, sprops, eo, false, true), sprops, iv);
    return { pulse: pulse, cbCount: 0 };
}

/**
 * Valve that regulates the drip (pulse event) flow rate of the I.V. catheter (emitter)
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {Object} opts the pulse emitter's options
 * @arg {(String | Object)} evt the event string or object
 * @returns {Object} the drip / pulse event w/callback function used by the I.V. catheter
 */
function valve(pw, iv, opts, evt) {
    if (!evt) {
        return;
    }
    var drip = driplet(pw, iv, evt, opts.endEvent);
    drip.callback = function callback(artery) {
        if (artery !== iv.artery) {
            return; // event may be emitted external from the current flow
        }
        iv.drain(drip);
    };
    if (drip.pulse.event !== opts.endEvent) {
        iv.push(drip);
        iv.meds.push(evt);
    }
    pw.on(drip.pulse.event, drip.callback);
    iv.dripCount += drip.pulse.event === opts.endEvent ? 0 : drip.pulse.repeat;
    return drip;
}