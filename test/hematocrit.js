'use strict';

var assert = require('assert');
var util = require('util');
var platelets = require('../lib/platelets');
var pulses = require('../');
var PulseEmitter = pulses.PulseEmitter;

var hematocrit = module.exports = run;
// node -e "require('./test/hematocrit').runDefault()"
hematocrit.runDefault = runDefault;

// global properties that are shared between arteries and pulses
// n == name, d == default value, i == true to inherit value from parent
var gprops = [{ n: 'type', d: 'series', i: true }, { n: 'repeat', d: 1 }];

function runDefault() {
    var p1 = ['one', 'two', 'three'];
    p1.type = 'parallel';
    p1.repeat = 2;
    p1.__args = ['A', 'B', 'C'];
    
    var p2 = ['one', { event: 'two', repeat: 10 }, 'three'];
    p2.__args = ['D', 'E', 'F'];
    
    var p3 = { events: ['one2', 'two2', 'three2'], type: 'parallel' };
    p3.__args = ['a', 'b', 'c'];
    
    run([p1, p2, p3]);
}

function listen(evt, i, tst, pump) {
    var evtObj = globalProps(evt, pump);
    tst.pw.on(evtObj.event, function testListener(artery, pulse) {
        tst.e.push({ artery: artery, endPulse: pulse });
        
        // artery
        globalProps(artery, pump, 'artery');
        assert.ok(Array.isArray(artery.data));
        
        // pulse
        globalProps(pulse, evtObj, 'pulse');
        assert.strictEqual(pulse.event, evtObj.event);
        
        var dcnt = i + 1;
        artery.data[0] = artery.data[0] ? artery.data[0] + 1 : 1;
        // TODO : assert.strictEqual(artery.data[0], dcnt, 'artery.data[0]: ' + artery.data[0] + ' !== test count: ' + dcnt);
        
        var args = Array.prototype.slice.call(arguments, 2);
        assert.deepEqual(args, tst.args, 'listener arguments: "' + args + '" != expected arguments: "' + tst.args + '"');
        console.log('%s', [util.inspect(artery), util.inspect(pulse)].concat(args));
    });
    tst.q.push(evtObj);
    return evtObj.event === tst.pw.endEvent;
}

function globalProps(o, other, nm) {
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
                (nm ? nm + '.' : '') + gprops[i].n + ': ' + o[gprops[i].n] + ' !== ' + other[gprops[i].n]);
        } else if (typeof o[gprops[i].n] === 'undefined') {
            o[gprops[i].n] = (other && gprops[i].i && other[gprops[i].n]) || gprops[i].d;
        }
        
    }
    return o;
}

function run(pumps, opts, tests) {
    var tsts = tests || [], pump, tst, hasEnd;
    for (var p = 0, pl = pumps.length; p < pl; p++, hasEnd = false) {
        if (!tests) {
            pump = globalProps(pumps[p]);
            tsts.push(tst = new Test(opts, pump.__args));
            for (var t = 0, pe = pump.events || pump, tl = pe.length; t < tl; t++) {
                hasEnd = listen(pe[t], t, tst, pump) || hasEnd;
            }
            if (!hasEnd) {
                listen(tst.pw.endEvent, t, tst, pump);
            }
        } else {
            tsts[p].pw.pump.apply(tsts[p].pw, [pumps[p]].concat(pumps[p].__args));
        }
    }
    if (!tests) {
        run(pumps, opts, tsts);
    }
}

function Test(opts, args) {
    this.pw = new PulseEmitter(opts);
    this.hasEndEvent = true;
    this.args = args;
    this.q = [];
    this.e = [];
    this.tick = function tick() {
        console.log('ticking');
        if (this.e.length <= this.q.length) platelets.defer(this.tick);
    };
}