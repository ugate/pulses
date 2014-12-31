'use strict';

var assert = require('assert');
var util = require('util');
var plet = require('../lib/platelets');
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
    
    var p3 = { events: ['one-2', 'two-2', 'three-2'], type: 'parallel' };
    p3.__args = ['a', 'b', 'c'];
    
    var p4 = { events: ['one-3', 'two-3', { event: 'three-3', type: 'series' }, { event: 'four-3', type: 'series' }], type: 'parallel' };
    p4.__args = ['1', 2, '3', true];

    run([p1, p2, p3]);
}

function listen(evt, i, p, glb, tst, pump) {
    var evtObj = globalProps(evt, pump);
    tst.pw.at(evtObj.event, function testListener(artery, pulse) {
        tst.cbs[evtObj.event] = (tst.cbs[evtObj.event] || 0) + 1;
        if (!glb[p]) {
            glb[p] = artery;
        }
        
        // artery
        globalProps(artery, pump, 'artery');
        assert.ok(Array.isArray(artery.data));
        assert.strictEqual(artery, glb[p]);
        
        // pulse
        globalProps(pulse, evtObj, 'pulse');
        assert.strictEqual(pulse.event, evtObj.event);
        
        // ensure the number of emissions equals the number of callbacks
        var xecnt = tst.emits[evtObj.event], isEnd = evtObj.event === tst.pw.endEvent;
        var offset = isEnd ? pump.repeat - 1 : 0, xccnt = offset + tst.cbs[evtObj.event];
        assert.strictEqual(artery.count + pulse.count, xecnt + xccnt, pulse.event + ' (artery.count: ' + artery.count + 
            ' + pulse.count: ' + pulse.count + ') !== (test emit count: ' + xecnt + ' + test callback count: ' + 
            (xccnt - offset) + ')');
        
        // artery data integrity
        var dcnt = i + 1;
        artery.data[0] = artery.data[0] ? artery.data[0] + 1 : 1;
        // TODO : assert.strictEqual(artery.data[0], dcnt, 'artery.data[0]: ' + artery.data[0] + ' !== test count: ' + dcnt);
        
        // arguments carried over?
        var args = Array.prototype.slice.call(arguments, 2);
        assert.deepEqual(args, tst.args, 'listener arguments: "' + args + '" != expected arguments: "' + tst.args + '"');

        console.log('%s', [util.inspect(artery), util.inspect(pulse)].concat(args));
    });
    tst.emits[evtObj.event] = (tst.emits[evtObj.event] || 0) + 1;
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
    var tsts = tests || [], pump, glb = [], tst, hasEnd;
    for (var p = 0, pl = pumps.length; p < pl; p++, hasEnd = false) {
        if (!tests) {
            pump = globalProps(pumps[p]);
            tsts.push(tst = new Test(opts, pump.__args));
            for (var t = 0, pe = pump.events || pump, tl = pe.length; t < tl; t++) {
                hasEnd = listen(pe[t], t, p, glb, tst, pump) || hasEnd;
            }
            if (!hasEnd) {
                listen(tst.pw.endEvent, t, p, glb, tst, pump);
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
    this.emits = {};
    this.cbs = {};
    this.tick = function tick() {
        console.log('ticking');
        //if (this.e.length <= this.q.length) plet.defer(this.tick);
    };
}