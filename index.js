'use strict';

var util = require('util');
var fs = require('fs');
var path = require('path');
var events = require('events');
var plet = require('./lib/platelets.js');
var cat = require('./lib/catheter.js');

util.inherits(PulseEmitter, events.EventEmitter);
util.inherits(PathEmitter, PulseEmitter);

var pulses = exports;
pulses.PulseEmitter = PulseEmitter;
pulses.PathEmitter = PathEmitter;
pulses.mergeObject = plet.merge;

/**
 * Basis for an {EventEmitter} with control flow operations and asynchronicity
 * 
 * @class PulseEmitter
 * @requires events
 * @arg {Object} [options={}] the pulse emitter options
 * @arg {String} [options.endEvent=end] the event type/name that will be emitted when a pump has completed
 * @arg {String} [options.errorEvent=error] the event type/name that will be emitted when an error occurs
 * @arg {Boolean} [options.emitErrors=false] true to catch errors that occur with listeners and emit an error event for each error encountered
 */
function PulseEmitter(options) {
    var opts = plet.merge({
        endEvent: 'end', 
        errorEvent: 'error',
        emitErrors: false
    }, options, true);
    events.EventEmitter.call(this);
    this.endEvent = opts.endEvent;
    this.errorEvent = opts.errorEvent;

    /**
     * @inheritdoc
     */
    PulseEmitter.prototype.listeners = function listeners(type) {
        for (var i = 0, ls = PulseEmitter.super_.prototype.listeners.call(this, type), l = ls.length; i < l; i++) {
            if (ls[i]._callback) ls.splice(i, 1, ls[i]._callback);
        }
        return ls;
    };
    
    /**
     * @inheritdoc
     */
    PulseEmitter.prototype.removeListener = function removeListener(type, listener) {
        for (var i = 0, ls = PulseEmitter.super_.prototype.listeners.call(this, type), l = ls.length; i < l; i++) {
            if (ls[i]._callback === listener) {
                return PulseEmitter.super_.prototype.removeListener.call(this, type, ls[i]);
            }
        }
        return this;
    };
    
    /**
     * @inheritdoc
     */
    PulseEmitter.prototype.addListener = function addListener(type, listener) {
        return listen(this, opts, type, listener);
    };
    
    /**
     * @inheritdoc
     */
    PulseEmitter.prototype.once = function once(type, listener) {
        return listen(this, opts, type, listener, 'once');
    };
    
    /**
     * @inheritdoc
     */
    PulseEmitter.prototype.on = PulseEmitter.prototype.addListener;
    
    /**
     * Same as `on` and `addListener` counterparts except the only events emitted with be events emitted via `pump`
     *
     * @callback listener
     * @arg {String} type the event type
     * @arg {listener} listener the listener function(artery, pulse, [...argument])
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.at = function at(type, listener) {
        return listen(this, opts, type, listener, null, true);
    };

    /**
     * Handles errors by emitting the corresponding event(s)
     * 
     * @emits the error event set in the pulse emitter's options passing in the {Error} in error listeners
     * @arg {Error} err the error to emit proceeded by an end event when "end" is true
     * @arg {Boolean} async true to emit the error asynchronously
     * @arg {Boolean} end true to emit the end event set in the pulse emitter's options
     * @arg {Array} ignores optional array of error.code that will be ignored
     * @returns {Error} the error when emission has occurred
     */
    PulseEmitter.prototype.error = function error(err, async, end, ignore) {
        if (err && (!ignores || !err.code || !!~ignores.indexOf(err.code))) {
            var args = Array.prototype.slice.call(arguments, this.error.length);
            (async ? this.emitAsync : this.emit).apply(this, [opts.errorEvent, err].concat(args));
            if (end) {
                (async ? this.emitAsync : this.emit).apply(this, [opts.endEvent, err].concat(args));
            }
            return err;
        }
    };
    
    /**
     * Emits asynchronously using `setImmediate` or `MutationObserver` in browsers that do not support `setImmediate`
     * 
     * @arg {Array} evts an array of event types to emit
     * @arg {...*} [arguments] arguments passed into listeners
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.emitAsync = function emitAsync(evts) {
        return plet.asyncd(this, evts, 'emit', arguments, this.emitAsync);
    };
    
    /**
     * Emits after all the supplied event types have been emitted
     * 
     * @arg {(Array | Object)} evts an array of event types to wait for emission
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.after = function after(evts) {
        infuse(this, opts, evts);
        return this;
    };
    
    /**
     * Pumps a set of events into a control flow sequence. Each event 
     * 
     * @arg {(Array | Object)} evts the pulse events with or w/o control flow properties, each item can be an event type string or an object with control properties
     * @arg {(String | Object)} evts.
     * @arg {...*} [arguments] arguments passed into listeners
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.pump = function pump(evts) {
        infuse(this, opts, evts, arguments, this.pump);
    };
}

/**
 * Listens for incoming events using event emitter's add listener function, but with optional error handling and pulse event only capabilities
 * 
 * @private
 * @callback listener
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Object} [opts] the pulse emitter options
 * @arg {String} type the event type
 * @arg {listener} listener the function to execute when the event type is emitted
 * @arg {String} [fnm=addListener] the optional function name that will be called on the pulse emitter
 * @arg {Boolean} [at=false] true to only execute the listener when the event is coming from a pump execution
 * @returns {PulseEmitter} the pulse emitter
 */
function listen(pw, opts, type, listener, fnm, at) {
    var fn = function pulseListener(artery, pulse) {
        if (at && !(artery instanceof cat.Artery)) {
            return; // not a pulse event
        }
        if (pulse.emitErrors || (pulse.emitErrors !== false && artery.emitErrors) || 
            (pulse.emitErrors !== false && artery.emitErrors !== false && opts.emitErrors)) {
            try {
                return listener.apply(this, arguments);
            } catch (e) {
                e.emitter = {
                    listener: listener,
                    artery: artery,
                    pulse: pulse,
                    arguments: Array.prototype.slice.apply(arguments, fn.length)
                };
                return pw.error(e);
            }
        }
        return listener.apply(this, arguments);
    };
    fn._callback = listener;
    return PulseEmitter.super_.prototype[fnm || 'addListener'].call(pw, type, fn);
}

/**
 * Traverses a series of paths
 * 
 * @class PathEmitter
 * @arg {RegExp} skipper an optional exclusionary regular expression or function(path) w/return value used to determine if a path will be skipped
 */
function PathEmitter(skipper) {
    var pw = this, cns = ['stats', 'mkdir'], dirSplit = /[\/\\]+/g;
    PulseEmitter.call(pw);
    pw.skip = function skip(pth) {
        if (util.isRegExp(skipper)) {
            rx.lastIndex = 0;
            return rx.test(pth);
        }
        return skipper && typeof skipper === 'function' ? skipper(pth) : false;
    };
    pw.Paths = function Paths(path, waitForDeps) {
        var po = this;
        for (var i = 0; i < cns.length; i++) {
            po[cns[i]] = { cnt: 0, ttl: 0 };
        }
        po.path = path;
        po.paths = pth ? Array.isArray(pth) ? pth : [pth] : [];
        po.waitForDeps = waitForDeps;
        po.ready = false;
    };
    pw.Work = function Work(src, dest, waitForSrcDeps, waitForDestDeps) {
        var wrk = this, map = [];
        wrk.src = new pw.Paths(src, waitForSrcDeps);
        wrk.dest = new pw.Paths(dest, waitForDestDeps);
    };
    pw.walk = function walk(src, dest) {
        pw.emit('paths', 'stats', 'src', true, true, new pw.Work(src, dest, false, true));
    };
    pw.on('paths', function paths(evt, typ, skips, split, wrk) {
        var po = wrk[typ], poc = po[evt], dup = {};
        for (var i = 0, l = po.paths.length, pth; i < l; i++) {
            pth = path.normalize(po.paths[i]);
            if (skips && pw.skip(pth)) {
                continue;
            }
            for (var j = 0, pa = split ? pth.split(dirSplit) : [pth], pl = pa.length, pr = ''; j < pl; j++) {
                if (dup[pa[j] + j]) {
                    continue; // prevent duplicates
                }
                dup[pa[j] + j] = true;
                pr = path.join(pr, pa[j]); // accumulative path used so original path is maintained
                poc.ttl++;
                pw.emitAsync(evt, pa.slice(0, j), pr, typ, wrk);
            }
        }
    });
    pw.on('stats', function stats(deps, pth, typ, wrk) {
        if (wrk[typ].waitForDeps && deps && deps.length) {
            pw.after('stats', deps, deps, pth, typ, wrk);
        } else {
            fs.stat(pth, pw.callback('statsDone', deps, pth, typ, wrk));
        }
    });
    pw.on('statsDone', function statsDone(deps, pth, typ, wrk, err, stats) {
        var po = wrk[typ], poc = po['stats'], isLast = (++poc.cnt) >= poc.ttl;
        err = pw.error(err, true, false, null, typ, pth);
        if (!err && stats.isDirectory()) {
            poc.ttl++; // increment to prevent completion of dir stats capture
            pw.emit('readdirStats', deps, pth, typ, wrk);
        } else {
            // ready to start processing the file/resource
            pw.emit(typ, err, pth, stats, isLast, wrk);
        }
    });
    pw.on('readdirStats', function readDirStats(deps, pth, typ, wrk) {
        fs.readdir(pth, pw.callback('readdirStatsDone', deps, pth, typ, wrk));
    });
    pw.on('readdirStatsDone', function readDirDone(deps, pth, typ, wrk, err, files) {
        // decrement total to inidcate completion of dir stats capture
        var po = wrk[typ], poc = po['stats'], isLast = poc.cnt >= (--poc.ttl);
        err = pw.error(err, true, false, null, typ, pth);
        if (!err) {
            pw.emit(pth, deps, pth, typ, wrk); // notify dirs w/dependency on the path
        }
        if (!err && files.length) {
            for (var i = 0; i < files.length; i++) {
                poc.ttl++;
                deps.push(pth);
                pw.emitAsync('stats', deps, path.join(pth, files[i]), typ, wrk);
            }
        } else {
            pw.emit(typ, err, pth, null, isLast, wrk);
        }
    });
    pw.on('src', function src(err, pth, stats, isLast, wrk) {
        wrk.src.ready = isLast;
        if (!err && pth && stats) {
            if (!wrk.dest.ready) {
            }
        }
    });
    pw.on('mkdir', function mkdir(pth, typ, wrk) {
        fs.mkdir(pth, pw.callback('mkdirDone', pth, typ, wrk));
    });
    pw.on('mkdirDone', function mkdirDone(pth, typ, wrk, err) {
        var po = wrk[typ], poc = po[typ], isLast = (++poc.cnt) >= poc.ttl;
        if (!pw.error(err, true, false, 'EEXIST', typ, pth)) {
                
        }
    });
}

/**
 * Emits event(s) after a given number of events are received
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Object} [options={}] the pulse emitter options
 * @arg {(Object | Array)} evts the events to pump through the catheter
 * @arg {...*} [args] the arguments that will be propagated to the emitter
 * @arg {function} [fn] the function.length that will be used to determine the starting index of the args
 * @returns {Array} the pumped I.V.
 */
function infuse(pw, options, evts, args, fn) {
    var iv = cat(pw, options, args && fn ? Array.prototype.slice.call(args, fn.length) : null);
    return iv.pump(evts, true);
}