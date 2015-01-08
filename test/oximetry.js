'use strict';

var assert = require('assert');
var util = require('util');
var plet = require('../lib/platelets');
var pulses = require('../');
var PulseEmitter = pulses.PulseEmitter;

// node -e "require('./test/oximetry').runDefault()"
var oximetry = module.exports = run;
oximetry.runDefault = runDefault;

var maxTestMsDflt = 1000;
// global properties that are shared between arteries and pulses
// n == name, d == default value, i == true to inherit value from parent
var gprops = [{ n: 'type', d: 'series', i: true }, { n: 'repeat', d: 1 }, { n: 'count', d: 0 }];

function runDefault() {
    var p = [], i = -1;

    p[++i] = ['one', 'two', 'three'];
    p[i].type = 'parallel';
    p[i].repeat = 2;
    p[i].__args = ['A', 'B', 'C'];
    
    p[++i] = ['one', { event: 'two', repeat: 5 }, 'three'];
    p[i].repeat = 2;
    p[i].__args = ['D', 'E', 'F'];
    
    p[++i] = { events: ['one-2', 'two-2', 'three-2'], type: 'parallel' };
    p[i].__args = ['a', 'b', 'c'];
    
    p[++i] = { events: ['one-3', 'two-3', { event: 'three-3', type: 'series' }, { event: 'four-3', type: 'series' }], type: 'parallel' };
    p[i].__args = ['1', 2, '3', true];

    run({ tests: p });
}

/**
 * Runs one or more tests against the supplied array of pulse emitter events
 *
 * @see {PulseEmitter#pump}
 * @arg {Object} [options={}] the options
 * @arg {Array} [options.tests] an array of pulse emitter test cases each of which will be passed into a newly generated pulse emitter's pump
 * @arg {function} [options.listener] an optional function that will be called on every pulse emitter emission
 * @arg {Integer} [options.maxWaitMs] maximum number of millisecods to wait for the tests to complete (in case events are not emitted)
 * @arg {Object} pulseEmitterOpts the options passed to new pulse emitters
 */
function run(options, pulseEmitterOpts) {
    new Oximeter(options).start(options.tests, pulseEmitterOpts);
}

function detect(diode) {
    var probe = diode.probe;
    probe.emitter.at(diode.heme.event, function testListener(artery, pulse) {
        var args = Array.prototype.slice.call(arguments, testListener.length);
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
    oxm.start = function start(hemo, opts) {
        for (var p = 0, pl = hemo.length; p < pl; p++) {
            activate(props(hemo[p]), opts);
        }
        iid = setTimeout(validate, maxWaitMs);
        for (var i = 0, l = probes.length; i < l; i++) {
            probes[i].emitter.pump.apply(probes[i].emitter, [hemo[i]].concat(hemo[i].__args));
        }
        return probes.length;
    };
    oxm.read = function read(id, chk, value) {
        var ia = value === null || isNaN(value), t = ia ? 'act' : 'exp', v = ia ? 1 : value || 1;
        if (!rds[id]) {
            rds[id] = { exp: 0, act: 0 };
        }
        rds[t] += rds[id][t] += v;
        console.log(id + '... exp: ' + rds[id].exp + ' act: ' + rds[id].act + ' (' + rds.exp + '/' + rds.act + ')');
        if (chk && rds.act >= rds.exp) {
            clearTimeout(iid);
            validate(true);
        }
    };
    function validate(forced) {
        assert.ok(rds.exp > 0, 'No tests to run');
        assert.ok(rds.act > 0, 'Expected ' + rds.exp + ' to run, but nothing ran');
        for (var id in rds) {
            assert.strictEqual(rds[id].act, rds[id].exp, 'Expected ' + rds[id].exp + ' ' + id + ', but found ' + 
                rds[id].act + (forced ? '' : ' after waiting for ' + maxWaitMs + ' ms'));
        }
    }
    function activate(hemo, opts) {
        hemo.count = 1; // override default count
        var probe = new Probe(oxm, probes.length, hemo, opts);
        oxm.arteries.push(hemo);
        probes.push(probe);
        probe.activate();
        return probe;
    }
    Object.seal(oxm);
}

function Probe(oxm, index, hemo, opts) {
    var probe = this;
    Object.freeze(probe.emitter = new PulseEmitter(opts));
    probe.oxm = oxm;
    probe.index = index;
    probe.hasEndEvent = true;
    Object.seal(probe.hemo = hemo);
    probe.args = hemo.__args;
    probe.data = [];
    probe.count = 0;
    probe.last = { pos: -1, cnt: 0, rpt: 0 };
    probe.marker = 'Test ' + probe.index;
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
        probe.oxm.read(probe.marker + ' ' + diode.marker, register && diode.isEnd, v);
    };
    probe.tick = function tick() {
        console.log('ticking');
        //if (probe.e.length <= probe.q.length) plet.defer(probe.tick);
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
    diode.marker = '"' + diode.heme.event + '"';
    diode.absorb = function absorb(artery, pulse) {
        var plst = diode.probe.last;
        diode.count++;
        diode.probe.count++;
        var pos = diode.index + 1; //console.log(pos + ' ' + diode.count + ' ' + diode.probe.count);
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