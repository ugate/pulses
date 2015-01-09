'use strict';

var assert = require('assert');
var util = require('util');
var path = require('path');
var fs = require('fs');
var plet = require('../lib/platelets');
var pulses = require('../');
var PulseEmitter = pulses.PulseEmitter;

// node -e "require('./test/oximetry').runDefault()"
// node -e "require('./test/oximetry')(require('./test/cases/prog.test')())"
// node -e "require('./test/oximetry')([require('./test/cases/repeat.complex.json')])"
var oximetry = module.exports = run;
oximetry.runDefault = runDefault;

var maxTestMsDflt = 1000;
// global properties that are shared between arteries and pulses
// n == name, d == default value, i == true to inherit value from parent
var gprops = [{ n: 'type', d: 'series', i: true }, { n: 'repeat', d: 1 }, { n: 'count', d: 0 }];

function runDefault() {
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
        run({ tests: p });
    });
}

/**
 * Runs one or more tests against the supplied array of pulse emitter events
 *
 * @see {PulseEmitter#pump}
 * @arg {(Object | Array)} [options={}] the options or an array that represents the options.tests
 * @arg {Array} [options.tests] an array of pulse emitter test cases each of which will be passed into a newly generated pulse emitter's pump
 * @arg {function} [options.listener] an optional function that will be called on every pulse emitter emission
 * @arg {Integer} [options.maxWaitMs] maximum number of millisecods to wait for the tests to complete (in case events are not emitted)
 * @arg {Object} emOpts the options passed to generated pulse emitters
 */
function run(options, emOpts) {
    new Oximeter(options).begin(options.tests || options, emOpts);
}

function detect(diode) {
    var probe = diode.probe;
    probe.emitter.at(diode.heme.event, function testListener(artery, pulse) {
        var args = arguments.length > testListener.length ? Array.prototype.slice.call(arguments, testListener.length) : undefined;
        console.log('%s', [util.inspect(artery), util.inspect(pulse)].concat(args));
        
        // update test values according to callback iteration
        var indices = diode.absorb(artery, pulse);
        
        // artery
        props(artery, probe.hemo, 'artery', 'arteryTest');
        assert.strictEqual(indices.other, indices.index, 'artery is not isolated to the artery at index ' + indices.index + 
            ' (found at: ' + indices.other + '): ' + util.inspect(artery));
        assert.ok(artery.count <= artery.repeat, 'artery occurred ' + artery.count + ' times and exceeded the repeat threshold: ' + artery.repeat);
        assert.ok(Array.isArray(artery.data));
        assert.strictEqual(artery.data[0], diode.probe.data[0], 'artery.data[0]: ' + artery.data[0] + ' !== expected: ' + diode.probe.data[0]);
        
        // pulse
        props(pulse, diode.heme, 'pulse', 'pulseTest');
        assert.strictEqual(pulse.event, diode.heme.event);
        assert.ok(pulse.count <= pulse.repeat, 'pulse occurred ' + pulse.count + ' times and exceeded the repeat threshold: ' + pulse.repeat);
        
        // arguments carried over?
        assert.deepEqual(args, probe.args, 'listener arguments: "' + args + '" != expected arguments: "' + probe.args + '"');
        
        // TODO : add event order assertion

        if (probe.oxm.listener) {
            probe.oxm.listener(diode);
        }
    });
    return diode;
}

function props(o, other, nm, onm) {
    var asrt = nm && other;
    if (asrt) {
        assert.ok(o, 'no ' + nm);
    } else {
        o = typeof o === 'string' ? { event: o } : o;
    }
    var i = gprops.length;
    while (i--) {
        if (asrt) {
            assert.strictEqual(o[gprops[i].n], other[gprops[i].n], 
                (nm ? nm + '.' : '') + gprops[i].n + ': ' + o[gprops[i].n] + ' !== ' + 
                (onm ? onm + '.' : '') + gprops[i].n + ': ' + other[gprops[i].n]);
        } else {
            propSet(other, gprops[i]);
            propSet(o, gprops[i], other);
        }
        
    }
    return o;
}

function propSet(o, gp, other) {
    if (o && typeof o[gp.n] === 'undefined') {
        o[gp.n] = (other && gp.i && other[gp.n]) || gp.d;
    }
}

function Oximeter(opts) {
    var oxm = this, probes = [], iid, maxWaitMs = typeof opts.maxWaitMs === null || isNaN(opts.maxWaitMs) ? maxTestMsDflt : opts.maxWaitMs;
    var rds = { exp: 0, act: 0 };
    oxm.listener = opts.listener;
    oxm.arteries = [];
    oxm.begin = function begin(hemo, emOpts) {
        banner('listening');
        for (var p = 0, pl = hemo.length; p < pl; p++) {
            activate(props(hemo[p]), emOpts);
        }
        iid = setTimeout(validate, maxWaitMs);
        start();
        for (var i = 0, l = probes.length; i < l; i++) {
            probes[i].emitter.pump.apply(probes[i].emitter, hemo[i].__args ? [hemo[i]].concat(hemo[i].__args) : [hemo[i]]);
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
    function start() {
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

function Probe(oxm, index, hemo, emOpts) {
    var probe = this;
    Object.freeze(probe.emitter = new PulseEmitter(emOpts));
    probe.oxm = oxm;
    probe.index = index;
    probe.hasEndEvent = true;
    Object.seal(probe.hemo = hemo);
    probe.args = hemo.__args;
    probe.data = [];
    probe.count = 0;
    probe.last = { pos: -1, cnt: 0, rpt: 0 };
    probe.marker = 'Test[' + probe.index + ']';
    probe.activate = function activate() {
        var hasEnd = false;
        for (var t = 0, pe = probe.hemo.events || probe.hemo, tl = pe.length; t < tl; t++) {
            hasEnd = detect(new Diode(probe, t, pe[t])).isEnd || hasEnd;
        }
        hasEnd = hasEnd || detect(new Diode(probe, -1, probe.emitter.endEvent));
        return hasEnd;
    };
    probe.read = function read(diode, register) {
        var v = register ? diode.isEnd ? 1 : probe.hemo.repeat * diode.heme.repeat : null;
        probe.oxm.read(probe.marker + ' ' + diode.marker, !register && diode.isEnd, v);
    };
    Object.seal(probe);
}

function Diode(probe, index, event) {
    var diode = this, pcnt;
    diode.probe = probe;
    Object.seal(diode.heme = props(event, diode.probe.hemo));
    diode.index = index;
    diode.isEnd = diode.heme.event === diode.probe.emitter.endEvent;
    diode.count = 0;
    diode.marker = diode.heme.event + (!!~diode.index ? '[' + diode.index + ']' : '');
    diode.absorb = function absorb(artery, pulse) {
        var plst = diode.probe.last;
        diode.count++;
        diode.probe.count++;
        var pos = diode.index + 1;
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
        return bleeding(artery, diode.probe.oxm, diode.probe.index);
    };
    diode.probe.read(diode, true);
    Object.seal(diode);
}

function bleeding(artery, oximeter, index) {
    if (!oximeter.arteries[index]) {
        oximeter.arteries[index] = artery;
    } else {
        for (var a in oximeter.arteries) {
            if (oximeter.arteries[a] === artery && a !== index) {
                return Object.freeze({ index: index, other: a << 0 });
            }
        }
    }
    return Object.freeze({ index: index, other: index });
}

function banner() {
    console.log('------------ %s ------------', util.format.apply(util.format, arguments));
}