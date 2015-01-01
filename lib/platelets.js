'use strict';

var platelets = exports;
platelets.asyncd = asyncd;
platelets.defer = defer;
platelets.merge = merge;

/**
 * Executes one or more events an asynchronously
 * 
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {string | array} evts the event or array of events
 * @arg {string} fname the function name to execute on the pulse emitter
 * @arg {array} args the arguments to pass into the pulse emitter function
 * @arg {function} fn an optional function whose arity is used to determine the starting index of the arguments that will be passed
 * @returns {PulseEmitter} the pulse emitter
 */
function asyncd(pw, evts, fname, args, fn) {
    args = Array.prototype.slice.call(args || arguments, fn ? fn.length : asyncd.length);
    var es = Array.isArray(evts) ? evts : [evts];
    for (var i = 0; i < es.length; i++) {
        if (es[i]) {
            defer(asyncCb.bind(es[i]));
        }
    }
    function asyncCb() {
        pw[fname].apply(pw, [this].concat(args));
    }
    return pw;
}

/**
 * Defers a function's execution to the next iteration in the event loop
 * 
 * @arg {function} cb the callback function
 * @returns {object} the callback's return value
 */
function defer(cb) {
    if (!defer.nextLoop) {
        var ntv = typeof setImmediate === 'function';
        defer.nextLoop = ntv ? setImmediate : function setImmediateShim(cb) {
            if (defer.obj) {
                if (!defer.cbs.length) {
                    defer.obj.setAttribute('cnt', 'inc');
                }
                defer.cbs.push(cb);
            } else {
                setTimeout(cb, 0);
            }
        };
        if (!ntv && typeof MutationObserver === 'object' && typeof document === 'object') {
            defer.cbs = [];
            defer.obj = document.createElement('div');
            defer.ob = new MutationObserver(function mutations() {
                for (var cbl = defer.cbs.slice(), i = defer.cbs.length = 0, l = cbl.length; i < l; i++) {
                    cbl[i]();
                }
            }).observe(defer.obj, { attributes: true });
        }
    }
    return defer.nextLoop(cb);
}

/**
 * Merges an object with the properties of another object
 * 
 * @arg {object} dest the destination object where the properties will be added
 * @arg {object} src the source object that will be used for adding new properties to the destination
 * @arg {boolean} ctyp flag that ensures that source values are constrained to the same type as the destination values when present
 * @arg {boolean} nou flag that prevents merge of undefined values
 * @arg {boolean} non flag that prevents merge of null values
 * @returns {object} the destination object
 */
function merge(dest, src, ctyp, nou, non) {
    if (!src || typeof src !== 'object') return dest;
    var keys = Object.keys(src);
    var i = keys.length, dt;
    while (i--) {
        if (isNaN(keys[i]) && src.hasOwnProperty(keys[i]) && 
            (!nou || (nou && typeof src[keys[i]] !== 'undefined')) &&
            (!non || (non && src[keys[i]] !== null))) {
            if (ctyp && dest[keys[i]] != null && (dt = typeof dest[keys[i]]) !== 'undefined' && dt !== typeof src[keys[i]]) {
                continue;
            }
            dest[keys[i]] = src[keys[i]];
        }
    }
    return dest;
}