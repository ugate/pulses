
var cat = module.exports = catheter;
cat.merge = merge;

/**
 * Generates a reusable I.V. that is capable of pumping meds (aka pulse events) through a pulse emitter
 * 
 * @param pw the pulse emitter
 * @param opts the options for end/error pulse event names
 * @param args the optional arguments that will be passed to listeners via emit
 * @returns an array with corresponding catheter functions
 */
function catheter(pw, opts, args) {
    var iv = [];
    iv.meds = null;
    iv.hasEnd = false;
    iv.ended = false;
    iv.emitted = [];
    iv.drained = [];
    iv.args = args || [];
    iv.artery = { type: iv.type };
    iv.vein = { data: [] };

    /**
     * Pumps pulse events (aka meds) through the pulse emitter
     * 
     * @params meds the pulse events
     */
    iv.pump = function pump(meds, begin) {
        if (iv.length) {
            return iv.drain();
        }
        typed(merge(iv, meds));
        iv.meds = Array.isArray(meds) ? meds : meds.events;
        for (var i = 0, l = iv.meds.length, d, ri = 0; i < l; i++, ri = 0) {
            valve(pw, iv, opts, iv.meds[i]);
        }
        var ivl = iv.length;
        if (ivl) {
            valve(pw, iv, opts, opts.endEvent);
            if (begin) {
                emits(pw, iv, 0);
            }
        }
        return ivl;
    };
    
    /**
     * Drains pending pulse events from being emitted (will not drain currently running async events)
     * Subsequently, continues pumping any remaining pulse events left in the artery once it's drained  
     * 
     * @param drip the optional I.V. drip created during a pump that contains pulse event data
     *        (omit will drains all pending pulse events except for async pulses)
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
                if (iv[i].async && iv[i].cbCount < iv[i].pulse.repeat) {
                    return; // need to wait for pending async callbacks
                } else if (i === 0 || !iv[i].async) {
                    if (x < 0) { // look at next emmited event
                        i = ci;
                        x = 1;
                    } else if (iv[i].cbCount < iv[i].pulse.repeat) { // start emitting next in line
                        emits(pw, iv, i);
                        i = -1;
                    }
                }
            }
        }
    };
    
    /**
     * Collapses the current capillary action so that the 
     * 
     * @param depth the numeric depth of the merge (omit for full)
     */
    iv.collapse = function collapse(depth) {

    };

    return iv;
};

/**
 * Universal emission of I.V. drips that will pass a artery object and a pulse object followed by any I.V. arguments into the emitter
 * 
 * @param pw the pulse emitter
 * @param iv the I.V. catheter
 * @param drip the drip that contains pulse event data
 */
function emit(pw, iv, drip) {
    iv.artery.type = iv.type || 'series'; // tamper proof (need artery to be same instance as one passed to listeners)
    var pulse = { event: drip.pulse.event, type: drip.pulse.type, repeat: drip.pulse.repeat || 1 };
    var a = [drip.pulse.event, iv.artery, iv.vein, pulse];
    a = iv.args.length ? a.concat(iv.args) : a;
    iv.emitted.push(pulse);
    (drip.async ? pw.emitAsync : pw.emit).apply(pw, a);
}

/**
 * When the event at the specified index is not async and has not been called back, the event for the passed index will be emitted
 * Also, if the pulse event is async, events are consecutively emitted until a sync event is encountered
 * 
 * @param pw the pulse emitter
 * @param iv the I.V. catheter
 * @param i the pulse event index to start from in the I.V.
 */
function emits(pw, iv, i) {
    for (var ci = i, a; iv[ci] && (ci === i || (iv[ci].cbCount < iv[ci].repeat && iv[ci].async)); ci++) {
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
    var pulse = typed(merge({ event: evt, repeat: 1 }, evt, true, true), iv.type);
    var drip = { pulse: pulse, cbCount: 0 };
    return drip;
}

/**
 * Sets the type of drip rate in which the I.V. will emitted
 * 
 * @param o the object where the type will be set
 * @param t an optional supplemental type used when the passed object has no defined type or is invalid
 * @returns the passed object
 */
function typed(o, t) {
    o.type = o.type ? o.type.toLowerCase() : t ? t.toLowerCase() : 'series';
    if (o.type !== 'parallel' && o.type !== 'fork' && o.type !== 'spawn' && o.type !== 'exec') {
        o.type = 'series';
    }
    o.async = t && o.type !== 'series' ? true : undefined;
    return o;
}

/**
 * Valve that regulates the drip (pulse event) flow rate of the I.V. catheter (emitter)
 * 
 * @param pw the pulse emitter
 * @param iv the I.V. catheter
 * @param evt the event string or object
 * @returns the drip (pulse event) callback function used by the I.V. catheter
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
    }
    pw.on(drip.pulse.event, drip.callback);
    return drip;
}

/**
 * Merges an object with the properties of another object
 * 
 * @param dest the destination object where the properties will be added
 * @param src the source object that will be used for adding new properties to the destination
 * @param nou boolean that prevents merge of undefined values
 * @param non boolean that prevents merge of null values
 * @returns the destination object
 */
function merge(dest, src, nou, non) {
    if (!src || typeof src !== 'object') return dest;
    var keys = Object.keys(src);
    var i = keys.length;
    while (i--) {
        if (isNaN(keys[i]) && src.hasOwnProperty(keys[i]) && 
            (!nou || (nou && typeof src[keys[i]] !== 'undefined')) &&
            (!non || (non && src[keys[i]] !== null))) {
            dest[keys[i]] = src[keys[i]];
        }
    }
    return dest;
}