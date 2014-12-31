'use strict';

var plet = require('./platelets.js');

var cat = module.exports = catheter;
cat.Artery = Artery;
cat.Pulse = Pulse;

/**
 * Generates a reusable I.V. that is capable of pumping meds (aka pulse events) through a pulse emitter
 * 
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {object} opts the pulse emitter's options
 * @arg {array} args the optional arguments that will be passed to listeners via emit
 * @returns {array} an array with corresponding catheter functions
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
     * @arg {array | object} meds the pulse events
     * @arg {boolean} begin true to begin emission
     * @returns {array} the I.V. array
     */
    iv.pump = function pump(meds, begin) {
        if (iv.length) {
            return iv.drain();
        }
        typed(plet.merge(iv, artery(iv, meds), true));
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
     * @arg {object} drip the optional I.V. drip created during a pump that contains pulse event data
     *        (omit will drains all pending pulse events except for async pulses)
     */
    iv.drain = function drain(drip) {
        var drips = iv, isEnd = false, isLast = false;
        if (drip) {
            drip.cbCount++;
            // end may be emitted externally, need to clear any pending listeners
            // event may be emitted externally, account for multiple emissions
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
            } else { // ensure end event is emitted
                emit(pw, iv, driplet(pw, iv, opts.endEvent));
            }
        } else if (!isLast) { // start emitting next queued pulse(s)
            for (var ci = iv.indexOf(drip), i = ci, x = -1; iv[i]; i += x) {
                //console.dir({ iv: iv[i], i: i, x: x, ci: ci });
                if (iv[i].cbCount < iv[i].pulse.repeat) {
                    if (iv[i].async) return; // need to wait for pending async callbacks
                    return emit(pw, iv, iv[i]); // start emitting next in line
                } else if (i === 0 && x < 0) { // look at next emmited event
                    i = ci;
                    x = 1;
                }
            }
        }
    };
    
    /**
     * Collapses the current capillary action so that the 
     * 
     * @arg {number} depth the numeric depth of the merge (omit for full)
     */
    iv.collapse = function collapse(depth) {

    };

    return iv;
};

/**
 * Generates an artery or sets properties an artery when the I.V. artery already exists
 * 
 * @private
 * @arg {array} iv the I.V. catheter
 * @arg {array} meds the pulse events
 * @returns {Artery} the artery
 */
function artery(iv, meds) {
    if (!iv.artery) {
        iv.artery = new Artery();
    }
    iv.artery.type = meds ? meds.type : iv.type;
    iv.artery.repeat = meds ? meds.repeat : iv.repeat;
    iv.artery.count = iv.count;
    iv.artery.data = iv.data;
    return iv.artery;
}

/**
 * Artery that will span the life of the cather
 * 
 * @class Artery
 */
function Artery() {
}

/**
 * Pulse event passed to listeners
 *
 * @class Pulse
 * @arg {object} the drip
 */
function Pulse(drip) {
    this.type = drip.pulse.type;
    this.repeat = drip.pulse.repeat || 1;
    this.count = drip.cbCount + 1;
    this.event = drip.pulse.event;
}

/**
 * Universal emission of I.V. drips that will pass a artery object and a pulse object followed by any I.V. arguments into the emitter
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {array} iv the I.V. catheter
 * @arg {object} drip the drip that contains pulse event data
 */
function emit(pw, iv, drip) {
    artery(iv); // tamper proof artery (needs to be the same instance as one passed to listeners)
    var pulse = new Pulse(drip);
    var a = [pulse.event, iv.artery, pulse];
    a = iv.args && iv.args.length ? a.concat(iv.args) : a;
    iv.emitted.push(pulse);
    (drip.async ? pw.emitAsync : pw.emit).apply(pw, a);
}

/**
 * When the event at the specified index is not async and has not been called back, the event for the passed index will be emitted
 * Also, if the pulse event is async, events are consecutively emitted until a sync event is encountered
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {array} iv the I.V. catheter
 * @arg {number} i the pulse event index to start from in the I.V.
 */
function emits(pw, iv, i) {
    for (var ci = i, a; iv[ci] && (ci === i || (iv[ci].cbCount < iv[ci].repeat && iv[ci].async)); ci++) {
        emit(pw, iv, iv[ci]);
    }
}

/**
 * Creates a drip for an I.V. catheter
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {array} iv the I.V. catheter
 * @arg {string | object} evt the pulse event
 * @returns {object} the drip (pulse event)
 */
function driplet(pw, iv, evt) {
    var pulse = typed(plet.merge({ event: typeof evt !== 'object' ? evt : null, repeat: 1 }, evt, true, true, true), iv.type);
    var drip = { pulse: pulse, cbCount: 0 };
    return drip;
}

/**
 * Sets the type of drip rate in which the I.V. will emitted
 * 
 * @private
 * @arg {object} o the object where the type will be set
 * @arg {string} t an optional supplemental type used when the passed object has no defined type or is invalid
 * @returns {object} the passed object
 */
function typed(o, t) {
    o.type = o.type ? o.type.toLowerCase() : t ? t.toLowerCase() : 'series';
    if (o.type !== 'parallel' && o.type !== 'fork' && o.type !== 'spawn' && o.type !== 'exec') {
        o.type = 'series';
    }
    if (!t) {
        o.async = o.type !== 'series';
    }
    return o;
}

/**
 * Valve that regulates the drip (pulse event) flow rate of the I.V. catheter (emitter)
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {array} iv the I.V. catheter
 * @arg {string | object} evt the event string or object
 * @returns {object} the drip (pulse event) callback function used by the I.V. catheter
 */
function valve(pw, iv, opts, evt) {
    if (!evt) {
        return;
    }
    var drip = driplet(pw, iv, evt);
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