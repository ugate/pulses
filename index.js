var util = require('util');
var fs = require('fs');
var path = require('path');
var stream = require('stream');
var events = require('events');
var catheter = require('./lib/catheter.js');

util.inherits(PulseEmitter, events.EventEmitter);
util.inherits(PathEmitter, PulseEmitter);

var pulses = exports;
pulses.PulseEmitter = PulseEmitter;
pulses.PathEmitter = PathEmitter;
pulses.mergeObject = catheter.merge;

var pw = new PulseEmitter(), pdone = false;
pw.on('one', function (artery, vein, pulse, a, b, c) {
    vein.data.push(pulse.event);
    console.log('%s, %s, %s, %s', util.inspect(artery), util.inspect(pulse), a, b, c);
});
pw.on('two', function (artery, vein, pulse, a, b, c) {
    vein.data.push(pulse.event);
    console.log('%s, %s, %s, %s', util.inspect(artery), util.inspect(pulse), a, b, c);
    //pw.emit('error', new Error('test error'));
});
pw.on('three', function (artery, vein, pulse, a, b, c) {
    vein.data.push(pulse.event);
    console.log('%s, %s, %s, %s', util.inspect(artery), util.inspect(pulse), a, b, c);
});
pw.on('one2', function (artery, vein, pulse, a, b, c) {
    vein.data.push(pulse.event);
    console.log('%s, %s, %s, %s', util.inspect(artery), util.inspect(pulse), a, b, c);
});
pw.on('two2', function (artery, vein, pulse, a, b, c) {
    vein.data.push(pulse.event);
    console.log('%s, %s, %s, %s', util.inspect(artery), util.inspect(pulse), a, b, c);
    //pw.emit('error', new Error('test error'));
});
pw.on('three2', function (artery, vein, pulse, a, b, c) {
    vein.data.push(pulse.event);
    console.log('%s, %s, %s, %s', util.inspect(artery), util.inspect(pulse), a, b, c);
});
pw.on('end', function (artery, vein, pulse, a, b, c) {
    vein.data.push(pulse.event)
    console.log('%s, %s, %s, %s', util.inspect(artery), util.inspect(pulse), a, b, c);
    if (artery.isAsync) {
        pdone = true;
    }
});
pw.on('error', function (e) {
    console.log(e);
});
var pl = ['one', 'two', 'three'];
pl.type = 'parallel';
pw.pump(pl, 'A', 'B', 'C');
//show();
pw.pump(['one', { event: 'two', repeat: 10 }, 'three'], 'D', 'E', 'F');
pw.pump({ events: ['one2', 'two2', 'three2'], type: 'parallel' }, 'a', 'b', 'c');
function show() {
    console.log('ticking');
    if (!pdone)
        defer(show);
}
/**
 * Emits event(s) after a given number of events are received
 * 
 * @param evt the event that will be emitted after the provided events are fired
 * @param evts the events to wait for emission
 * @param args the arguments that will be propagated to the emitter
 * @param fn the function.length that will be used to determine the starting index of the args
 * @param async true asynchronous emission, false for synchronous emission
 */
function infuse(pw, opts, evts, args, fn) {
    var iv = catheter(pw, opts, args && fn ? Array.prototype.slice.call(args, fn.length) : null);
    iv.pump(evts, iv.args.length);
}

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
}
function Callback(cb, pw) {
    
}

function PulseEmitter(options) {
    var pw = this, opts = catheter.merge({ endEvent: 'end', errorEvent: 'error' }, options);
    events.EventEmitter.call(pw);
    pw.on = function on() {
        var args = Array.prototype.slice.call(arguments, 0);
        var rc = args[1] && typeof args[1] === 'function' ? 1 : 0;
        var cb = args.splice(1, rc, function pulseListener(evt) {
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
        })[0];
        PulseEmitter.super_.prototype.on.apply(pw, args);
    };
    pw.error = function error(err, async, fail, ignore) {
        if (err && (!ignore || err.code !== ignore)) {
            var args = Array.prototype.slice.call(arguments, pw.error.length);
            (async ? pw.emitAsync : pw.emit).apply(pw, ['error', err].concat(args));
            if (fail) {
                (async ? pw.emitAsync : pw.emit).apply(pw, ['end', err].concat(args));
            }
            return err;
        }
    };
    pw.emitAsync = function emitAsync(evts) {
        asyncd(pw, evts, 'emit', arguments, pw.emitAsync);
    };
    pw.after = function after(evts) {
        infuse(pw, opts, evts);
    };
    pw.pump = function pump(evts) {
        infuse(pw, opts, evts, arguments, pw.pump);
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
 * Defers a function's execution to the next iteration in the event loop
 * 
 * @param cb the callback function
 * @returns the callback's return value
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