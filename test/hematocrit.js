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

    run(p);
}

function listen(evt, i, p, arteries, tst) {
    var pulset = props(evt, tst.artery), cbcnt = 0;
    tst.pw.at(pulset.event, function testListener(artery, pulse) {
        console.log('%s', [util.inspect(artery), util.inspect(pulse)].concat(args));
        cbcnt++;
        var isEnd = pulset.event === tst.pw.endEvent;

        // update test values according to callback iteration
        tst.cnts[pulset.event] = (tst.cnts[pulset.event] || 0) + 1;
        tst.artery.count = (tst.artery.count || 1) + (isEnd || cbcnt > tst.ttl ? 1 : 0);
        pulset.count = (pulset.count || 0) + 1;
        var bi = bleeding(artery, p, arteries);
        
        // artery
        props(artery, tst.artery, 'artery', 'arteryTest');
        assert.ok(bi === p, 'Artery is not isolated to the pump at index ' + p + ' (found at: ' + bi + '): ' + util.inspect(artery));
        assert.ok(Array.isArray(artery.data));
        
        // pulse
        props(pulse, pulset, 'pulse', 'pulseTest');
        assert.strictEqual(pulse.event, pulset.event);
        
        // ensure the number of emissions equals the number of callbacks
        /*var xecnt = tst.emits[pulset.event];
        tst.offset += isEnd ? tst.artery.repeat - 1 : 0;
        var xccnt = tst.offset + tst.cbs[pulset.event];
        assert.strictEqual(artery.count + pulse.count, xecnt + xccnt, pulse.event + ' (artery.count: ' + artery.count + 
            ' + pulse.count: ' + pulse.count + ') !== (test emit count: ' + xecnt + ' + test callback count: ' + 
            (xccnt - tst.offset) + ')');*/
        
        // artery data integrity
        var dcnt = i + 1;
        artery.data[0] = artery.data[0] ? artery.data[0] + 1 : 1;
        // TODO : assert.strictEqual(artery.data[0], dcnt, 'artery.data[0]: ' + artery.data[0] + ' !== test count: ' + dcnt);
        
        // arguments carried over?
        var args = Array.prototype.slice.call(arguments, 2);
        assert.deepEqual(args, tst.args, 'listener arguments: "' + args + '" != expected arguments: "' + tst.args + '"');
        
        // reset pulse test count in case there are artery repeates
        pulset.count = isEnd ? 0 : pulset.count;
    });
    tst.ttl += pulset.repeat;
    tst.emits[pulset.event] = (tst.emits[pulset.event] || 0) + 1;
    return pulset.event === tst.pw.endEvent;
}

function bleeding(artery, p, arteries) {
    if (!arteries[p]) {
        arteries[p] = artery;
    } else {
        for (var a in arteries) {
            if (arteries[a] === artery && a !== p) {
                return a << 0;
            }
        }
    }
    return p;
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

function run(pumps, opts, tests) {
    var tsts = tests || [], arteries = [], tst, hasEnd;
    for (var p = 0, pl = pumps.length; p < pl; p++, hasEnd = false) {
        if (!tests) {
            tsts.push(tst = new Test(opts, props(pumps[p]), pl));
            for (var t = 0, pe = tst.artery.events || tst.artery, tl = pe.length; t < tl; t++) {
                hasEnd = listen(pe[t], t, p, arteries, tst) || hasEnd;
            }
            if (!hasEnd) {
                listen(tst.pw.endEvent, t, p, arteries, tst);
            }
        } else {
            tsts[p].pw.pump.apply(tsts[p].pw, [pumps[p]].concat(pumps[p].__args));
        }
    }
    if (!tests) {
        run(pumps, opts, tsts);
    }
}

function Test(opts, artery, ttl) {
    this.pw = new PulseEmitter(opts);
    this.hasEndEvent = true;
    this.artery = artery;
    this.args = artery.__args;
    this.ttl = ttl;
    this.offset = 0;
    this.emits = {};
    this.cnts = {};
    this.tick = function tick() {
        console.log('ticking');
        //if (this.e.length <= this.q.length) plet.defer(this.tick);
    };
}