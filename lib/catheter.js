/**
 * Generates a reusable I.V. that is capable of pumping meds (aka pulse events) through a pulse emitter
 * 
 * @param pw the pulse emitter
 * @param opts the options for end/error pulse event names
 * @param args the optional arguments that will be passed to listeners via emit
 * @returns an array with corresponding catheter functions
 */
module.exports = function catheter(pw, opts, args) {
    var iv = [];
    iv.meds = null;
    iv.hasEnd = false;
    iv.ended = false;
    iv.emitted = [];
    iv.drained = [];
    iv.args = args || [];
    iv.flow = { data: [] };
    
    /**
     * Pumps pulse events (aka meds) through the pulse emitter
     * 
     * @params meds the pulse events
     */
    iv.pump = function pump(meds, begin) {
        if (iv.length) {
            return iv.drain();
        }
        for (var n in meds) {
            if (isNaN(n) && meds.hasOwnProperty(n)) {
                iv[n] = meds[n];
            }
        }
        iv.meds = Array.isArray(meds) ? meds : meds.events;
        for (var i = 0, l = iv.meds.length; i < l; i++) {
            regulate(pw, iv, opts, iv.meds[i]);
        }
        var ivl = iv.length;
        if (ivl) {
            regulate(pw, iv, opts, opts.endEvent);
            if (begin) {
                emits(pw, iv, 0);
            }
        }
        return ivl;
    };
    
    /**
     * Drains pending pulse events from being emitted (will not drain currently running parallel events)
     * Subsequently, continues pumping any remaining pulse events left in the flow once it's drained  
     * 
     * @param drip the optional I.V. drip created during a pump that contains pulse event data
     *        (omit will drains all pending pulse events except for parallel pulses)
     */
    iv.drain = function drain(drip) {
        var drips = iv, isEnd = false, isLast = false;
        if (drip) {
            drip.cbCount++;
            // end may be emitted externally, need to clear any pending listeners
            // event may be emitted externally, account for multiple emissions
            drips = (isEnd = drip.pulse.event === opts.endEvent) ? iv : drip.cbCount > 1 ? [] : [drip];
            iv.drained.push(drip.pulse.event);
        }
        var l = drips.length;
        if (l) {
            for (var i = 0; i < l; i++) {
                pw.removeListener(drips[i].pulse.event, drips[i].callback);
            }
            drips.length = 0;
        }
        isLast = iv.drained.length >= iv.length;
        // start emitting the next pulse(s)
        if (!isEnd && isLast) {
            emit(pw, iv, driplet(pw, iv, opts.endEvent)); // ensure end event is emitted
        } else if (!isLast) {
            for (var ci = iv.indexOf(drip), i = ci, x = -1; iv[i]; i += x) {
                if (iv[i].pulse.parallel && !iv[i].cbCount) {
                    return; // need to wait for pending parallel callbacks
                } else if (i === 0 || !iv[i].pulse.parallel) {
                    if (x < 0) { // look at next emmited event
                        i = ci;
                        x = 1;
                    } else if (!iv[i].cbCount) { // start emitting next in line
                        emits(pw, iv, i);
                        i = -1;
                    }
                }
            }
        }
    };
    return iv;
};

/**
 * Universal emission of I.V. drips that will pass a flow object and a pulse object followed by any I.V. arguments into the emitter
 * 
 * @param pw the pulse emitter
 * @param iv the I.V. catheter
 * @param drip the drip that contains pulse event data
 */
function emit(pw, iv, drip) {
    iv.flow.parallel = iv.parallel || false; // no tamper (need flow to be same instance as one passed to listeners)
    var pulse = { event: drip.pulse.event };
    var a = [drip.pulse.event, iv.flow, pulse];
    a = iv.args.length ? a.concat(iv.args) : a;
    iv.emitted.push(pulse);
    (drip.pulse.parallel ? pw.emitAsync : pw.emit).apply(pw, a);
}

/**
 * When the event at the specified index is not parallel and has not been called back, the event for the passed index will be emitted
 * Also, if the pulse event is parallel, events are consecutively emitted until a non-parallel event is encountered
 * 
 * @param pw the pulse emitter
 * @param iv the I.V. catheter
 * @param i the pulse event index to start from in the I.V.
 */
function emits(pw, iv, i) {
    for (var ci = i, a; iv[ci] && (ci === i || (!iv[ci].cbCount && iv[ci].pulse.parallel)); ci++) {
        emit(pw, iv, iv[ci]);
    }
}

/**
 * Creates a drip for an I.V. catheter
 * 
 * @param pw the pulse emitter
 * @param iv the I.V. catheter
 * @param evt the event string or object
 * @returns the drip
 */
function driplet(pw, iv, evt) {
    var drip = { pulse: evt && typeof evt === 'object' ? evt : { event: evt }, cbCount: 0 };
    drip.pulse.parallel = typeof drip.pulse.parallel === 'boolean' ? drip.pulse.parallel : iv.parallel || false;
    return drip;
}

/**
 * Regulates the drip (pulse event) flow rate of the I.V. catheter (emitter)
 * 
 * @param pw the pulse emitter
 * @param iv the I.V. catheter
 * @param evt the event string or object
 * @returns the drip (pulse event) callback function used by the I.V. catheter
 */
function regulate(pw, iv, opts, evt) {
    if (!evt) {
        return;
    }
    var drip = driplet(pw, iv, evt);
    drip.callback = function callback(flow) {
        if (flow !== iv.flow) {
            return; // event may be emitted external from the current flow
        }
        iv.drain(drip);
    };
    if (drip.pulse.event !== opts.endEvent) {
        iv.push(drip);
    }
    pw.on(drip.pulse.event, drip.callback);
    return drip.callback;
}