'use strict';

var assert = require('assert');

/**
 * Pulse emitter utilities
 */
var plet = exports;
plet.asyncd = asyncd;
plet.defer = defer;
plet.merge = merge;
plet.props = props;
plet.prop = prop;

/**
 * Executes one or more events an asynchronously
 * 
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {(String | Array)} evts the event or array of events
 * @arg {String} fname the function name to execute on the pulse emitter
 * @arg {Array} args the arguments to pass into the pulse emitter function
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
 * @returns {Object} the callback's return value
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
 * @arg {Object} dest the destination object where the properties will be added
 * @arg {Object} src the source object that will be used for adding new properties to the destination
 * @arg {Boolean} ctyp flag that ensures that source values are constrained to the same type as the destination values when present
 * @arg {Boolean} nou flag that prevents merge of undefined values
 * @arg {Boolean} non flag that prevents merge of null values
 * @returns {Object} the destination object
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

/**
 * Assigns property values on an object or asserts that object properties are within the defined boundaries when other object is passed along with its name
 * 
 * @arg {Object} o the object to assign properties to or assert properties for
 * @arg {Object[]} pds property definition objects that determine which properties will be assigned or asserted
 * @arg {String} pds[].n the name of the property that will be assigned or asserted
 * @arg {*} [pds[].d] a default value that will be used when there is no property defined on the other object (assignment only)
 * @arg {Boolean} [pds[].i] true to inherit value from the passed other object (assignment only)
 * @arg {Number} [pds[].l] when the property is a number, the lowest acceptable numeric value for the property (assignment only)
 * @arg {Number} [pds[].h] when the property is a number, the highest acceptable numeric value for the property (assignment only)
 * @arg {Object[]} [pd.r] a range of valid values that the property value will be restricted to (assignment only)
 * @arg {Object} [other] other object that will be used for default property values or when assertion will be used for equallity
 * @arg {Boolean} [io] true to always inherit from the other object properties regardless of property definition (assignment only)
 * @arg {String} [nm] a name used for the object (assertion only)
 * @arg {String} [onm] a name used for the other object (assertion only)
 * @returns {Object} the passed object
 */
function props(o, pds, other, io, nm, onm) {
    var asrt = nm && other;
    if (asrt) assert.ok(o, 'no ' + nm);
    var i = pds.length;
    while (i--) {
        if (asrt) prop(o, pds[i], other, io, nm, onm);
        else {
            if (other) prop(other, pds[i]);
            prop(o, pds[i], other, io);
        }
    }
    return o;
}

/**
 * Assigns a property value on an object or asserts that object property is within the defined boundaries when other object is passed along with its name
 * 
 * @arg {Object} o the object to assign properties to or assert properties for
 * @arg {Object} pd the property definition that determine which property will be assigned or asserted
 * @arg {String} pd.n the name of the property that will be assigned or asserted
 * @arg {*} [pd.d] a default value that will be used when there is no property defined on the other object (assignment only)
 * @arg {Boolean} [pd.i] true to inherit value from the passed other object (assignment only)
 * @arg {Number} [pd.l] when the property is a number, the lowest acceptable numeric value for the property (assignment only)
 * @arg {Number} [pd.h] when the property is a number, the highest acceptable numeric value for the property (assignment only)
 * @arg {Object[]} [pd.r] a range of valid values that the property value will be restricted to (assignment only)
 * @arg {Object} [other] another object that will be used for default property values or when assertion will be used for equallity
 * @arg {Boolean} [io] true to always inherit from the other object properties regardless of property definition (assignment only)
 * @arg {String} [nm] a name assigned to the object (assertion only)
 * @arg {String} [onm] a name assigned to the other object (assertion only)
 * @returns {Object} the passed object
 */
function prop(o, pd, other, io, nm, onm) {
    if (nm && other) {
        assert.strictEqual(o[pd.n], other[pd.n], (nm ? nm + '.' : '') + pd.n + ': ' + o[pd.n] + ' !== ' + 
            (onm ? onm + '.' : '') + pd.n + ': ' + other[pd.n]);
    } else {
        var typ = (o && typeof o[pd.n]) || '', v;
        if (typ === 'undefined') v = (other && (io || pd.i) && other[pd.n]) || pd.d;
        else if (typ === 'number') v = o[pd.n] < pd.l ? pd.l : o[pd.n] > pd.h ? pd.h : undefined;
        if (typeof v !== 'undefined' && (!pd.r || !!~pd.r.indexOf(v))) o[pd.n] = v;
    }
    return o;
}