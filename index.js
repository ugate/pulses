'use strict';

var util = require('util');
var fs = require('fs');
var path = require('path');
var events = require('events');
var platelets = require('./lib/platelets.js');
var catheter = require('./lib/catheter.js');

util.inherits(PulseEmitter, events.EventEmitter);
util.inherits(PathEmitter, PulseEmitter);

var pulses = exports;
pulses.PulseEmitter = PulseEmitter;
pulses.PathEmitter = PathEmitter;
pulses.mergeObject = platelets.merge;

function PulseEmitter(options) {
    var opts = platelets.merge({ endEvent: 'end', errorEvent: 'error' }, options, true);
    events.EventEmitter.call(this);
    this.endEvent = opts.endEvent;
    this.errorEvent = opts.errorEvent;
    PulseEmitter.prototype.addListener = function addListener() {
        var args = Array.prototype.slice.call(arguments, 0), pw = this;
        var rc = args[1] && typeof args[1] === 'function' ? 1 : 0, cb;
        var fn = function pulseListener(evt) {
            //try {
                //if (cb) {
                    cb.apply(this, arguments);
                //} else if (true) {
                //    evt.data.push('');
                //}
            //} catch (e) {
                //e.event = args[0];
                //throw e;
                //pw.error(e);
            //}
        };
        cb = args.splice(1, rc, fn)[0];
        fn._callback = cb;
        return PulseEmitter.super_.prototype.addListener.apply(pw, args);
    };
    PulseEmitter.prototype.on = PulseEmitter.prototype.addListener;
    PulseEmitter.prototype.listeners = function listeners(type) {
        for (var i = 0, ls = PulseEmitter.super_.prototype.listeners.call(this, type), l = ls.length; i < l; i++) {
            if (ls[i]._callback) ls.splice(i, 1, ls[i]._callback);
        }
        return ls;
    };
    PulseEmitter.prototype.removeListener = function removeListener(type, listener) {
        for (var i = 0, ls = PulseEmitter.super_.prototype.listeners.call(this, type), l = ls.length; i < l; i++) {
            if (ls[i]._callback === listener) {
                return PulseEmitter.super_.prototype.removeListener.call(this, type, ls[i]);
            }
        }
    };
    PulseEmitter.prototype.error = function error(err, async, fail, ignore) {
        if (err && (!ignore || err.code !== ignore)) {
            var args = Array.prototype.slice.call(arguments, this.error.length);
            (async ? this.emitAsync : this.emit).apply(this, ['error', err].concat(args));
            if (fail) {
                (async ? this.emitAsync : this.emit).apply(this, ['end', err].concat(args));
            }
            return err;
        }
    };
    PulseEmitter.prototype.emitAsync = function emitAsync(evts) {
        platelets.asyncd(this, evts, 'emit', arguments, this.emitAsync);
    };
    PulseEmitter.prototype.after = function after(evts) {
        infuse(this, opts, evts);
    };
    PulseEmitter.prototype.pump = function pump(evts) {
        infuse(this, opts, evts, arguments, this.pump);
    };
    //pw.data = function dataFunc(fn) {
    //    return function data(evt) {
    //        evt.callback
    //    };
    //    var iv = catheter(true, arguments);
    //    callbacked('error', pw, iv);
    //    return callbacked(evt, pw, iv);
    //};
}

/**
 * Traverses a series of paths
 * 
 * @constructor
 * @param skipper an optional exclusionary regular expression or function(path) w/return value used to determine if a path will be skipped
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
 * @param evt the event that will be emitted after the provided events are fired
 * @param evts the events to wait for emission
 * @param args the arguments that will be propagated to the emitter
 * @param fn the function.length that will be used to determine the starting index of the args
 * @param async true asynchronous emission, false for synchronous emission
 * @returns the pumped I.V.
 */
function infuse(pw, opts, evts, args, fn) {
    var iv = catheter(pw, opts, args && fn ? Array.prototype.slice.call(args, fn.length) : null);
    return iv.pump(evts, true);
}