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
 * @arg {*[]} args the arguments to pass into the pulse emitter function
 * @returns {PulseEmitter} the pulse emitter
 */
function asyncd(pw, evts, fname, args) {
    var es = Array.isArray(evts) ? evts : [evts];
    for (var i = 0; i < es.length; i++) {
        if (es[i]) {
            defer(asyncCb.bind(es[i]));
        }
    }
    function asyncCb() {
        var argsp = args && args.length ? [this] : null;
        if (argsp) {
            argsp.push.apply(argsp, args);
            pw[fname].apply(pw, argsp);
        } else pw[fname](this);
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
    return defer.nextLoop.call(null, cb);
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
 * Assigns property values on a destination object or asserts that the destination object properties are within the defined boundaries when a source object is passed along with its name
 * 
 * @arg {Object} dest the object to assign properties to or assert properties for
 * @arg {Object[]} pds property definition objects that determine which properties will be assigned or asserted
 * @arg {String} pds[].n the name of the property that will be assigned or asserted
 * @arg {*} [pds[].d] a default value that will be used when there is no property defined on the source object (assignment only)
 * @arg {Boolean} [pds[].i] true to inherit value from the passed source object (assignment only)
 * @arg {Number} [pds[].l] when the property is a number, the lowest acceptable numeric value for the property (assignment only)
 * @arg {Number} [pds[].h] when the property is a number, the highest acceptable numeric value for the property (assignment only)
 * @arg {Object[]} [pd.r] a range of valid values that the property value will be restricted to (assignment only)
 * @arg {Object} [src] source object that will be used for default property values or when assertion will be used for equallity
 * @arg {Boolean} [isrc] true to always inherit from the source object properties when the value is not undefined, regardless of property definition (assignment only)
 * @arg {String} [nm] a name used for the object (assertion only)
 * @arg {String} [nmsrc] a name used for the source object (assertion only)
 * @returns {Object} the passed object
 */
function props(dest, pds, src, isrc, ndflt, nm, nmsrc) {
    var asrt = nm && src;
    if (asrt) assert.ok(dest, 'no ' + nm);
    var i = pds.length;
    while (i--) {
        if (asrt) prop(dest, pds[i], src, isrc, ndflt, nm, nmsrc);
        else prop(dest, pds[i], src, isrc, ndflt);
    }
    return dest;
}

/**
 * Assigns a property value on a destination object or asserts that the destination object property is within the defined boundaries when a source object is passed along with its name
 * 
 * @arg {Object} dest the object to assign properties to or assert properties for
 * @arg {Object} pd the property definition that determine which property will be assigned or asserted
 * @arg {String} pd.n the name of the property that will be assigned or asserted
 * @arg {*} [pd.d] a default value that will be used when there is no property defined on the source object (assignment only)
 * @arg {Boolean} [pd.i] true to inherit value from the passed source object (assignment only)
 * @arg {Number} [pd.l] when the property is a number, the lowest acceptable numeric value for the property (assignment only)
 * @arg {Number} [pd.h] when the property is a number, the highest acceptable numeric value for the property (assignment only)
 * @arg {Object[]} [pd.r] a range of valid values that the property value will be restricted to (assignment only)
 * @arg {Object} [src] source object that will be used for default property values or when assertion will be used for equallity
 * @arg {Boolean} [isrc] true to always inherit from the source object properties when the value is not undefined, regardless of property definition (assignment only)
 * @arg {String} [nm] a name assigned to the object (assertion only)
 * @arg {String} [nmsrc] a name assigned to the source object (assertion only)
 * @returns {Object} the passed object
 */
function prop(dest, pd, src, isrc, ndflt, nm, nmsrc) {
    if (nm && src) {
        assert.strictEqual(dest[pd.n], src[pd.n], (nm ? nm + '.' : '') + pd.n + ': ' + dest[pd.n] + ' !== ' + 
            (nmsrc ? nmsrc + '.' : '') + pd.n + ': ' + src[pd.n]);
    } else {
        var typ = (dest && typeof dest[pd.n]) || '', v;
        if (typ === 'undefined') v = (src && (isrc || pd.i) && src[pd.n]) || (ndflt ? undefined : pd.d);
        else if (typ === 'number') v = typeof pd.l === 'number' && dest[pd.n] < pd.l ? pd.l : typeof pd.h === 'number' && dest[pd.n] > pd.h ? pd.h : undefined;
        else if (typ === 'object') v = pd.v && Array.isArray(pd.v) ? props(dest[pd.n], pd.v, src[pd.n], isrc, ndflt, nm, nmsrc) : undefined;
        if (typeof v !== 'undefined' && (!pd.r || !!~pd.r.indexOf(v))) dest[pd.n] = v;
    }
    return dest;
}