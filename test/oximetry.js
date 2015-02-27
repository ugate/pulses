'use strict';

var assert = require('assert');
var util = require('util');
var path = require('path');
var fs = require('fs');
var plet = require('../lib/platelets');
var cat = require('../lib/catheter');
var pulses = require('../');
var PulseEmitter = pulses.PulseEmitter;

// node -e "require('./test/oximetry').runDefault()"
// node -e "require('./test/oximetry')(require('./test/cases/prog.test')())"
// node -e "require('./test/oximetry')([require('./test/cases/repeat.complex.json')])"
var oximetry = module.exports = run;
oximetry.runDefault = runDefault;

var maxTestMsDflt = 1000;

/**
 * Runs one or more tests against the supplied array of pulse emitter events
 *
 * @see {@link PulseEmitter#to}
 * @arg {(Object | Array)} [options={}] the options or an array that represents the options.tests
 * @arg {Array} [options.tests] an array of pulse emitter test cases each of which will be passed into a newly generated pulse emitter's "to" function
 * @arg {function} [options.listener] an optional function that will be called on every pulse emitter emission
 * @arg {Integer} [options.maxWaitMs] maximum number of millisecods to wait for the tests to complete (in case events are not emitted)
 * @arg {Object} emOpts the options passed to generated pulse emitters
 */
function run(options, emOpts) {
    new Oximeter(options).begin(options.tests || options, emOpts);
}

/**
 * Requires each of the files within the "cases" directory and appends them as test cases. If the file exports a function the function will
 * be called and should return an array or object that will be appended to the commulative test cases. Each test case can contain a **__test**
 * object with a **pass** array of arguments that will be set via the listener using **artery.pass**. For example, to pass *1, 2, 3*:
 * 
 * __test: { pass: [1, 2, 3] }
 * 
 * @see {@link run}
 * @arg {Object} [options={}] the run options minus the test cases
 */
function runDefault(options) {
    var cpth = path.join(__dirname, 'cases');
    fs.readdir(cpth, function caseDir(err, files) {
        if (err) {
            throw err;
        }
        files.sort();
        var p = [];
        for (var i = 0, l = files.length, f; i < l; i++) {
            f = require(path.join(cpth, files[i]));
            if (typeof f === 'function') {
                p = p.concat(f());
            } else {
                p.push(f);
            }
        }
        var o = plet.merge({}, options);
        o.tests = p;
        run(o);
    });
}

function detect(diode, holder) {
    var probe = diode.probe;
    probe.emitter.at(diode.heme.event, function testListener(artery, pulse) {
        //console.log('pulse.id === ' + pulse.id + ' && diode.heme.id === ' + diode.heme.id);
        if (artery.id !== probe.hemo.id || (!diode.isEnd && pulse.id !== diode.heme.id)) return;
        var args = arguments.length > testListener.length ? Array.prototype.slice.call(arguments, testListener.length) : undefined;
        console.log('%s', [util.inspect(artery), util.inspect(pulse)].concat(args));
        
        //assert.ok(diode, 'Exceeded "' + evt + '" event(s) at slot: ' + probe.diodes[evt].length);
        
        // update test values according to callback iteration
        var indices = diode.absorb(artery, pulse);
        
        // artery
        cat.assertlet(artery, probe.hemo, 'artery', 'arteryTest');
        assert.strictEqual(indices.other, indices.slot, 'artery is not isolated to the artery at slot ' + indices.slot + 
            ' (found at: ' + indices.other + '): ' + util.inspect(artery));
        assert.ok(artery.count <= artery.repeat, 'artery occurred ' + artery.count + ' times and exceeded the repeat threshold: ' + artery.repeat);
        assert.ok(Array.isArray(artery.data));
        assert.strictEqual(artery.data[0], diode.probe.data[0], 'artery.data[0]: ' + artery.data[0] + ' !== expected: ' + diode.probe.data[0]);
        
        // pulse
        cat.assertlet(pulse, diode.heme, 'pulse', 'pulseTest');
        assert.strictEqual(pulse.event, diode.heme.event);
        assert.ok(pulse.count <= pulse.repeat, 'pulse occurred ' + pulse.count + ' times and exceeded the repeat threshold: ' + pulse.repeat);
        
        // verify test arguments have been passed from
        var passed = !probe.lastDiode ? probe.test && probe.test.pass : probe.lastDiode && probe.lastDiode.test && probe.lastDiode.test.pass;
        assert.deepEqual(args, passed, 'listener arguments: "' + args + '" != expected arguments: "' + passed + '"');
        
        // add any test arguments that will be passed into the next listener
        if (diode.test && diode.test.pass) {
            artery.pass.splice.apply(artery.pass, [artery.pass.length, 0].concat(diode.test.pass));
        }

        // TODO : add event order assertion

        if (probe.oxm.listener) {
            probe.oxm.listener(diode);
        }
        if (diode.heme.count >= diode.heme.repeat) probe.lastDiode = diode;
    });
    return diode;
}

function arterylet(src) {
    return cat.arterylet(hemit(src));
}

function pulselet(artery, event, endEvent) {
    return cat.pulselet(artery, event === endEvent ? event : hemit(event, null, endEvent), endEvent);
}

function hemit(o, id, endEvent) {
    o = typeof o === 'string' ? { event: o } : o;
    if ((!endEvent || o.event !== endEvent) && !o.id) o.id = id || (Math.random() * 10000 >> 0);
    return o;
}

function Oximeter(opts) {
    var oxm = this, probes = [], iid, maxWaitMs = typeof opts.maxWaitMs === null || isNaN(opts.maxWaitMs) ? maxTestMsDflt : opts.maxWaitMs;
    var rds = { exp: 0, act: 0 };
    oxm.listener = opts.listener;
    oxm.arteries = [];
    oxm.begin = function begin(hemo, emOpts) {
        banner('listening');
        for (var p = 0, pl = hemo.length; p < pl; p++) {
            activate(arterylet(hemo[p]), emOpts);
        }
        iid = setTimeout(validate, maxWaitMs);
        start();
        for (var i = 0, l = probes.length; i < l; i++) {
            probes[i].emitter.to.apply(probes[i].emitter, probes[i].test.pass ? [hemo[i]].concat(probes[i].test.pass) : [hemo[i]]);
        }
        return probes.length;
    };
    oxm.read = function read(id, chk, value) {
        var ia = value === null || isNaN(value), t = ia ? 'act' : 'exp', v = ia ? 1 : value || 1;
        if (!rds[id]) {
            rds[id] = { exp: 0, act: 0 };
        }
        rds[id][t] += v;
        rds[t] += v;
        console.log(id + ': exp ' + rds[id].exp + ' act ' + rds[id].act + ' (' + rds.exp + '/' + rds.act + ')');
        if (chk && rds.act >= rds.exp) {
            clearTimeout(iid);
            validate(true);
        }
    };
    function validate(forced) {
        assert.ok(rds.exp > 0, 'Nothing ran');
        assert.ok(rds.act > 0, 'Expected ' + rds.exp + ' to run, but nothing ran');
        for (var id in rds) {
            assert.strictEqual(rds[id].act, rds[id].exp, id + ' expected ' + rds[id].exp + ', but found ' + 
                rds[id].act + (forced ? '' : ' after waiting for ' + maxWaitMs + ' ms'));
        }
        stop();
    }
    function start(probing) {
        banner('emitting');
        rds.start = process.hrtime();
    }
    function stop() {
        rds.finish = process.hrtime(rds.start);
        rds.ms = (rds.finish[0] * 1e9 + rds.finish[1]) / 1000000;
        banner('Completed %s/%s tests in %s ms', rds.act, rds.exp, rds.ms);
    }
    function activate(hemo, emOpts) {
        hemo.count = 1; // override default count
        var probe = new Probe(oxm, probes.length, hemo, emOpts);
        oxm.arteries.push(hemo);
        probes.push(probe);
        probe.activate();
        return probe;
    }
    Object.seal(oxm);
}

function Probe(oxm, slot, hemo, emOpts) {
    var probe = this;
    Object.freeze(probe.emitter = new PulseEmitter(emOpts));
    probe.oxm = oxm;
    probe.slot = slot;
    probe.hasEndEvent = true;
    Object.seal(probe.hemo = hemo);
    probe.data = [];
    probe.count = 0;
    probe.test = hemo.__test || {};
    probe.lastDiode = null;
    probe.last = { pos: -1, cnt: 0, rpt: 0 };
    probe.marker = (hemo.id ? hemo.id + ' ' : '') + 'Test[' + probe.slot + ']';
    probe.diodes = {};
    probe.activate = function activate() {
        var hasEnd = false;
        for (var t = 0, pe = probe.hemo.events || probe.hemo, tl = pe.length; t < tl; t++) {
            hasEnd = detect(new Diode(probe, t, pe[t], pe)).isEnd || hasEnd;
        }
        hasEnd = hasEnd || detect(new Diode(probe, -1, probe.emitter.options.endEvent));
        return hasEnd;
    };
    probe.read = function read(diode, register) {
        var v = register ? diode.isEnd ? 1 : probe.hemo.repeat * diode.heme.repeat : null;
        probe.oxm.read(probe.marker + ' ' + diode.marker, !register && diode.isEnd, v);
    };
    Object.seal(probe);
}

function Diode(probe, slot, event, events) {
    var diode = this, pcnt;
    diode.probe = probe;
    Object.seal(diode.heme = pulselet(diode.probe.hemo, event, diode.probe.emitter.options.endEvent));
    if (typeof event === 'object' && event.__test) diode.test = event.__test;
    if (events) events[slot] = hemit(events[slot], diode.heme.id);
    //console.dir({ event: event, test: diode.heme });
    diode.slot = slot;
    diode.isEnd = diode.heme.event === diode.probe.emitter.options.endEvent;
    diode.count = 0;
    diode.marker = (diode.heme.id || '') + ' ' + diode.heme.event + (!!~diode.slot ? '[' + diode.slot + ']' : '');
    diode.absorb = function absorb(artery, pulse) {
        var plst = diode.probe.last;
        diode.count++;
        diode.probe.count++;
        var pos = diode.slot + 1;
        if (plst.pos >= 0 && pos === plst.pos && diode.count > plst.cnt) {
            diode.heme.count++;
            plst.rpt++;
        } else {
            diode.heme.count = 1;
            if (plst.pos >= 0 && pos === 1) {
                diode.probe.hemo.count++;
            }
        }
        plst.pos = pos;
        plst.cnt = diode.count;
        diode.probe.read(diode);
        return bleeding(artery, diode.probe.oxm, diode.probe.slot);
    };
    diode.probe.read(diode, true);
    Object.seal(diode);
}

function bleeding(artery, oximeter, slot) {
    if (!oximeter.arteries[slot]) {
        oximeter.arteries[slot] = artery;
    } else {
        for (var a in oximeter.arteries) {
            if (oximeter.arteries[a] === artery && a !== slot) {
                return Object.freeze({ slot: slot, other: a << 0 });
            }
        }
    }
    return Object.freeze({ slot: slot, other: slot });
}

function banner() {
    console.log('------------ %s ------------', util.format.apply(util.format, arguments));
}