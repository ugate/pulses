'use strict';

var plet = require('./platelets.js');

// global properties that are shared between arteries and pulses
// n == name, d == default value, i == true to inherit value from parent, l == lowest numeric value, h == highest numeric value, r == restrict to values
// v == array of property recursion to be perfomed on the property name/value
var dfltType = 'async';
var sprops = [
    { n: 'type', d: dfltType, i: true, r: [dfltType, 'fork', 'spawn', 'exec', 'sync', 'forkSync', 'spawnSync', 'execSync'] },
    { n: 'repeat', d: 1, l: 1 },
    { n: 'count', d: 0 },
    { n: 'target', v: [{ n: 'repeat', d: 1, l: 1 }, { n: 'debounce' }, { n: 'select' }] },
    { n: 'emitErrors' },
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
 * @arg {*[]} [pass] the arguments that will be passed to the first listener in the chain (after artery and pulse)
 * @arg {*[]} [args] the arguments that will be passed to all listeners in the chain (after any "pass" arguments from a prior listener)
 * @returns {Array} an I.V. array with corresponding catheter functions
 */
function catheter(pw, lfn, pass, args) {
    var iv = [];
    iv.listen = lfn;
    iv.dripCount = 0;
    iv.count = 1;
    iv.meds = [];
    iv.hasEnd = false;
    iv.ended = false;
    iv.emitted = [];
    iv.drained = [];
    iv.artery = null;
    iv.data = [];
    iv.pass = pass && Array.isArray(pass) ? pass : [];
    iv.passing = iv.pass.slice();
    iv.args = args && Array.isArray(args) ? args : null;
    
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
        plet.merge(iv, artery(pw, iv, meds), true);
        meds = Array.isArray(meds) ? meds : meds.events;
        for (var i = 0, l = meds.length; i < l; i++) {
            if (valve(pw, iv, meds[i]).pulse.event === pw.options.endEvent) {
                iv.drain(null, true);
                throw new TypeError('Explicit declaration of "' + pw.options.endEvent + '" event detected at index ' + i);
            }
        }
        if (iv.length) {
            valve(pw, iv, pw.options.endEvent);
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
     * @arg {Object} [drip=iv] the drip created during a pump that contains pulse event details
     *        (omit will drain all pending pulse events except for async pulses)
     * @arg {Boolean} [exit] true to prevent continuation of event drainage after listeners have been removed (must also omit drip)
     */
    iv.drain = function drain(drip, exit) {
        var drips = iv, isEnd = false, isLast = false;
        if (drip) {
            drip.cbCount++;
            drips = (isEnd = drip.pulse.event === pw.options.endEvent) ? iv : drip.cbCount < drip.pulse.repeat ? [] : [drip];
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
        if (!drip && exit) return;
        isLast = iv.drained.length >= iv.dripCount;
        if (!isEnd && isLast) {
            if (iv.count < iv.repeat) { // rinse/repeat
                iv.count++;
                for (var i = iv.length = 0, l = iv.meds.length; i < l; i++) {
                    valve(pw, iv, iv.meds[i]);
                }
                emits(pw, iv, 0);
            } else if (!iv.ended) { // ensure end event is emitted
                iv.ended = true;
                new Drip(pw, iv, pw.options.endEvent, pw.options.endEvent, true);
            }
        } else if (!isLast) { // start emitting next queued pulse event(s)
            for (var ci = iv.indexOf(drip), i = ci, x = -1; iv[i]; i += x) {
                //console.dir({ iv: iv[i], i: i, x: x, ci: ci });
                if (iv[i].cbCount < iv[i].pulse.repeat) {
                    return iv[i].emit(pw, iv); // start emitting next in line
                } else if (i === 0 && x < 0) { // look at next emmited event
                    i = ci;
                    x = 1;
                }
            }
        }
    };
    
    /**
     * Flow control
     */
    iv.flow = {
        
        /**
         * Pauses control flow execution until resumed
         * 
         * @arg {...function} [arguments] any functions that need to be queued to execute once the flow resumes
         * @returns {*[]} the current pass array
         */
        pause: function pause() {
            iv.stases = iv.stases || [];
            iv.stasesEnds = iv.stasesEnds || [];
            if (arguments.length) arguments.length === 1 ? iv.stases.push(arguments[0]) : iv.stases.push.apply(iv.stases, arguments);
            return iv.pass.length ? iv.pass.slice() : [];
        },
        
        /**
         * Resumes control flow execution after executing waiting functions queued during pausing
         */
        resume: function resume() {
            if (iv.stases) {
                for (var i = 0; i < iv.stases.length; i++) iv.stases[i]();
                if (iv.stasesEnds) for (var j = 0; j < iv.stasesEnds.length; j++) iv.stasesEnds[j]();
            }
            iv.stases = iv.stasesEnds = null;
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
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {Array} meds the pulse events
 * @returns {Artery} the artery
 */
function artery(pw, iv, meds) {
    if (!iv.artery) {
        iv.artery = new Artery();
    }
    plet.props(iv.artery, sprops, meds || iv, true);
    iv.artery.count = iv.count;
    iv.artery.data = iv.data;
    iv.artery.pass = iv.pass;
    return iv.artery;
}

/**
 * Pulse event passed to listeners
 *
 * @private
 * @class Pulse
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {Object} drip the drip
 */
function Pulse(pw, iv, drip) {
    var pulse = this;
    plet.merge(pulse, drip.pulse);
    pulse.count = drip.cbCount + 1;
    pulse.event = drip.pulse.event;
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
    return (new Drip(null, artery, event, endEvent)).pulse;
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
    for (var ci = i, a; iv[ci] && (ci === i || iv[ci].cbCount < iv[ci].repeat); ci++) {
        iv[ci].emit(pw, iv);
    }
}

/**
 * Creates a drip for an I.V. catheter
 * 
 * @private
 * @class Drip
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {(String | Object)} evt the pulse event
 * @arg {String} endEvent the end event
 * @arg {Boolean} [emit] true to emit
 * @returns {Object} the drip / pulse
 */
function Drip(pw, iv, evt, endEvent, emit) {
    var ieo = typeof evt === 'object', eo = ieo ? evt : null, pulse = { event: ieo ? evt.event : evt };
    if (!pulse.event) throw new Error('Event is required');
    if (eo && eo.id) pulse.id = eo.id; // IDs are not inherited because iv/pulse IDs are non-transferable
    this.pulse = plet.props(plet.props(pulse, sprops, eo, true, true), sprops, iv); // pulse should only contain values from the event or inherited from the iv
    this.cbCount = 0;
    if (emit) this.emit(pw, iv);
}

/**
 * Universal emission of I.V. drips that will pass a artery object and a pulse object followed by any I.V. arguments into the emitter
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {Boolean} [noStases] true to prevent stases queueing
 * @returns {*} the emission return
 */
Drip.prototype.emit = function emit(pw, iv, noStases) {
    var drip = this;
    if (!noStases && iv.stasesEnds) return iv.stasesEnds.push(function eflux() {
        drip.emit(pw, iv, true);
    });
    artery(pw, iv); // tamper proof artery (needs to be the same instance as one passed to listeners- drop IE 9 support can use getters)
    var pulse = new Pulse(pw, iv, drip), sy = drip.pulse.type === 'sync', m = sy ? pw.emit : pw.emitAsync;
    var isPass = sy || drip.pulse.event === pw.options.endEvent, args;
    var argsp = (iv.passing = isPass ? iv.pass.slice() : iv.passing).length ? iv.passing : null, argsg = iv.args && iv.args.length ? iv.args : null;
    if (!iv.stases) iv.emitted.push(pulse);
    if (argsp || argsg) {
        args = [pulse.event, iv.flow, iv.artery, pulse];
        if (argsp) args.push.apply(args, argsp);
        if (argsg) args.push.apply(args, argsg);
        if (isPass) iv.pass.length = iv.passing.length = 0; // auto-clear passed parameters
    }
    return args ? m.apply(pw, args) : m.call(pw, pulse.event, iv.flow, iv.artery, pulse);
};

/**
 * Valve that regulates the drip (pulse event) flow rate of the I.V. catheter (emitter)
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Array} iv the I.V. catheter
 * @arg {(String | Object)} evt the event string or object
 * @returns {Object} the drip / pulse event w/callback function used by the I.V. catheter
 */
function valve(pw, iv, evt) {
    if (!evt) {
        return;
    }
    var drip = new Drip(pw, iv, evt, pw.options.endEvent);
    drip.callback = function callback(artery) {
        if (artery !== iv.artery) {
            return; // event may be emitted external from the current flow
        }
        iv.drain(drip);
    };
    if (drip.pulse.event !== pw.options.endEvent) {
        iv.push(drip);
        iv.meds.push(evt);
    }
    iv.listen(drip.pulse.event, drip.callback);
    iv.dripCount += drip.pulse.event === pw.options.endEvent ? 0 : drip.pulse.repeat;
    return drip;
}