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
// node -e "require('./test/oximetry')([require('./test/cases/test1.json')])"
var oximetry = module.exports = run;
oximetry.runDefault = runDefault;

var maxTestMsDflt = 10000;

/**
 * Test data
 * 
 * @example Passing *1, 2, 3*
 * __test: { pass: [1, 2, 3] }
 * @example Retrofitting a callback pattern that will pass the arguments *'a', 'b', 'c'*
 * __test: { retrofit: { args: ['a', 'b', 'c'] } }
 * @callback test
 * @arg {*[]} [pass] an array of test arguments that will be added to the **artery.pass** when the listener detects event emission
 * @arg {Object} [retrofit] an object that indicates that the listener should be retrofitted to accommodate callbacks, etc.
 * @arg {String} [retrofit.type=callback] the typeof retrofit
 * @arg {*[]} [retrofit.args] an array of arguments that will be passed to the callback (typically the first argument should be an Error or null)
 */

/**
 * Runs one or more tests against the supplied array of pulse emitter events
 *
 * @see {@link PulseEmitter#to}
 * @arg {(Object | Array)} [options={}] the options or an array that represents the options.tests
 * @arg {test[]} [options.tests] an array of pulse emitter test cases each of which will be passed into a newly generated pulse emitter's control flow chain
 * @arg {function} [options.listener] a function that will be called on every pulse emitter emission
 * @arg {Number} [options.maxWaitMs=10000] the maximum number of milliseconds to wait for an emission response before aborting pulse detections
 * @arg {Object} emOpts the options passed to generated pulse emitters
 */
function run(options, emOpts) {
    new Oximeter(options).begin(options.tests || options, emOpts);
}

/**
 * Requires each of the files within the "cases" directory and appends them as test cases. If the file exports a function the function will
 * be called and should return an array or object that will be appended to the commulative test cases.
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

/**
 * Asserts and tracks the progress of a diodes lifespan by listening for the diode's event
 * 
 * @private
 * @arg {Diode} diode the encapsulated event data that will be used to test against incoming arteries/pulses
 * @returns {Diode} the passed diode
 */
function detect(diode) {
    var probe = diode.probe;
    retrofit(diode);
    probe.emitter.at(diode.heme.event, function testListener(artery, pulse) {
        //console.log('pulse.id === ' + pulse.id + ' && diode.heme.id === ' + diode.heme.id);
        if (artery.id !== probe.hemo.id || (!diode.isEnd && pulse.id !== diode.heme.id)) return;
        var args = arguments.length > testListener.length ? Array.prototype.slice.call(arguments, testListener.length) : [], arr;
        var isPass = diode.heme.type === 'sync' || diode.heme.event === probe.emitter.options.endEvent || probe.test.pass;
        if (probe.test.pass) { // initial arguments passed in from emitter chain invocation
            probe.pass.push.apply(probe.pass, probe.test.pass);
            probe.test.pass.length = 0;
        }
        var passed = isPass ? probe.pass.slice() : [];
        if (isPass) probe.pass.length = 0;
        
        // add any test arguments that will be passed into the next listener
        if (diode.test && diode.test.pass) {
            (arr = []).push.apply(arr, diode.test.pass);
            artery.pass.push.apply(artery.pass, arr);
            probe.pass.push.apply(probe.pass, arr);
        }
        (arr = [util.inspect(artery), util.inspect(pulse)]).push.apply(arr, args);
        console.log('%s', arr);
        
        // verify test arguments have been passed from
        assert.deepEqual(args, passed, 'listener arguments: "' + args + '" != expected arguments: "' + passed + '"');
        assert.deepEqual(artery.pass, probe.pass, 'listener pass: "' + artery.pass + '" != expected pass: "' + probe.pass + '"');

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

        // TODO : add event order assertion

        if (probe.oxm.listener) {
            probe.oxm.listener(diode);
        }
    });
    return diode;
}

/**
 * Retrofits a diode for use with callbacks, etc.
 * 
 * @private
 * @arg {Diode} diode the encapsulated event data that will be used to test against incoming arteries/pulses
 */
function retrofit(diode) {
    if (!diode.test.retrofit) return;
    diode.probe.oxm.read(diode.probe.markerCb, false, diode.probe.hemo.repeat * diode.heme.repeat, true);
    diode.probe.emitter.at(diode.heme.event, function cbTest() {
        diode.probe.oxm.read(diode.probe.markerCb, true, null, true);
        var args = arguments, cb = args.length ? args[args.length - 1] : null;
        assert.ok(typeof cb === 'function', 'last argument is not a valid callback function: ' + util.inspect(args));
        plet.defer(function immediateCb() {
            var argsr = diode.test.retrofit.args;
            console.log('================ %s retrofit i/o ======================', diode.heme.event);
            console.dir(args);
            console.dir(argsr);
            console.log('====================================================');
            if (argsr && argsr.length) {
                if (argsr[0] instanceof Error) diode.probe.oxm.read(diode.probe.markerError, false, 1, true);
                diode.probe.pass.push.apply(diode.probe.pass, argsr);
                cb.apply(null, argsr);
            } else cb();
        });
    }, diode.test.retrofit.type || 'callback');
}

/**
 * Arteries are generated based upon a pre-defined set of properties that have inherit restrictions enforced on their values
 *
 * @private
 * @arg {(String | Object | *[])} src the source artery definition that will transformed
 * @returns {Object} an artery-like object with a randomly generated identifier
 */
function arterylet(src) {
    return cat.arterylet(hemit(src));
}

/**
 * Pulses are generated based upon a pre-defined set of properties that have inherit restrictions enforced on their values
 *
 * @private
 * @arg {object} artery an artery-like object
 * @arg {(String | Object)} event either the event name or an object that contains an event property
 * @arg {String} endEvent the event that represents an end to the control flow chain
 * @returns {Object} an pulse-like object with a randomly generated identifier (unless it's representing an end event)
 */
function pulselet(artery, event, endEvent) {
    return cat.pulselet(artery, event === endEvent ? event : hemit(event, null, endEvent), endEvent);
}

/**
 * Transfoms the passed element into an object, if needed, and sets a radomly generated *id* property (or the passed identify value; nothing set for end events)
 * 
 * @arg {(String | Object)} o either the event name or an object that contains an event property
 * @arg {*} [id] an explicit identifier to set
 * @arg {String} endEvent the event that represents an end to the control flow chain
 * @returns {Object} the transformed object
 */
function hemit(o, id, endEvent) {
    o = typeof o === 'string' ? { event: o } : o;
    if ((!endEvent || o.event !== endEvent) && !o.id) o.id = id || (Math.random() * 10000 >> 0);
    return o;
}

/**
 * A calibrated instrument used to detect the saturation levels of pulse events and measures the accuracy of its emission
 * 
 * @class
 * @private
 * @arg {(Object | Array)} [opts={}] the options or an array that represents the opts.tests
 * @arg {test[]} [opts.tests] an array of pulse emitter test cases each of which will be passed into a newly generated pulse emitter's control flow chain
 * @arg {function} [opts.listener] a function that will be called on every pulse emitter emission
 * @arg {Number} [opts.maxWaitMs=10000] the maximum number of milliseconds to wait for an emission response before aborting pulse detections
 */
function Oximeter(opts) {
    var oxm = this, probes = [], iid, maxWaitMs = typeof opts.maxWaitMs === null || isNaN(opts.maxWaitMs) ? maxTestMsDflt : opts.maxWaitMs;
    var rds = { exp: 0, act: 0 };
    oxm.listener = opts.listener;
    oxm.arteries = [];
    
    /**
     * Begins pulse emission/detection on multiple control flow chains
     * 
     * @arg {Object} the hemo/artery-like object definition to start detection on
     * @arg {Object} emOpts the options passed to generated pulse emitters
     * @returns {Integer} the number of probes generated/executed
     */
    oxm.begin = function begin(hemo, emOpts) {
        banner('listening');
        for (var p = 0, pl = hemo.length; p < pl; p++) {
            activate(arterylet(hemo[p]), emOpts);
        }
        iid = setTimeout(validate, maxWaitMs);
        start();
        for (var i = 0, l = probes.length, arr; i < l; i++) {
            arr = [hemo[i]];
            if (probes[i].test.pass) arr.push.apply(arr, probes[i].test.pass);
            probes[i].emitter.to.apply(probes[i].emitter, arr);
        }
        return probes.length;
    };
    
    /**
     * Reads/compares actual readings against the expected readings emission results for pulse saturation levels
     * 
     * @arg {*} id a unique marker identifier for the pulse emission
     * @arg {Boolean} chk true to validate the reading
     * @arg {*} value the value to read
     */
    oxm.read = function read(id, chk, value, isCb) {
        var ia = value === null || isNaN(value), t = ia ? 'act' : 'exp', v = ia ? 1 : value || 1;
        if (!rds[id]) {
            rds[id] = { exp: 0, act: 0 };
        }
        rds[id][t] += v;
        if (!isCb) rds[t] += v;
        console.log(id + ': exp ' + rds[id].exp + ' act ' + rds[id].act + ' (' + rds.exp + '/' + rds.act + ')');
        if (chk && rds.act >= rds.exp) {
            clearTimeout(iid);
            validate(true);
        }
    };
    
    /**
     * Validates the current state of previous read operations and stops detection
     * 
     * @private
     * @arg {Boolean} forced whether or not the validation has been manually invoked
     */
    function validate(forced) {
        assert.ok(rds.exp > 0, 'Nothing ran');
        assert.ok(rds.act > 0, 'Expected ' + rds.exp + ' to run, but nothing ran');
        for (var id in rds) {
            assert.strictEqual(rds[id].act, rds[id].exp, id + ' expected ' + rds[id].exp + ', but found ' + 
                rds[id].act + (forced ? '' : ' after waiting for ' + maxWaitMs + ' ms'));
        }
        stop();
    }
    
    /**
     * Starts read detections
     * 
     * @private
     */
    function start() {
        banner('emitting');
        rds.start = process.hrtime();
    }
    
    /**
     * Stops read detections
     * 
     * @private
     */
    function stop() {
        rds.finish = process.hrtime(rds.start);
        rds.ms = (rds.finish[0] * 1e9 + rds.finish[1]) / 1000000;
        banner('Completed %s/%s tests in %s ms', rds.act, rds.exp, rds.ms);
    }
    
    /**
     * Activates reads for incoming arteries/pulses on the defined hemo/artery-like definition
     * 
     * @private
     * @arg {Object} the hemo/artery-like object definition to activate reads on
     * @arg {Object} emOpts the options passed to generated pulse emitters
     * @returns {Probe} the generated probe that is performing reads
     */
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

/**
 * Probe used to detect pulse emissions for a single control flow chain
 * 
 * @class
 * @private
 * @arg {Oximeter} oxm the oximeter that the probe is connected to
 * @arg {Integer} slot the unique slot number that the probe is assigned to on the oximeter
 * @arg {Object} hemo the artery-like definition fed to the probe
 * @arg {Object} emOpts the options passed to generated pulse emitters
 */
function Probe(oxm, slot, hemo, emOpts) {
    var probe = this;
    Object.freeze(probe.emitter = new PulseEmitter(emOpts));
    probe.oxm = oxm;
    probe.slot = slot;
    probe.hasEndEvent = true;
    Object.seal(probe.hemo = hemo);
    probe.data = [];
    probe.pass = [];
    probe.count = 0;
    probe.expErrCnt = 0;
    probe.actErrCnt = 0;
    probe.test = hemo.__test || {};
    probe.last = { pos: -1, cnt: 0, rpt: 0 };
    probe.marker = (hemo.id ? hemo.id + ' ' : '') + 'Test[' + probe.slot + ']';
    probe.markerCb = probe.marker + ' callback';
    probe.markerError = probe.marker + ' ' + probe.emitter.options.errorEvent;
    probe.diodes = {};
    
    /**
     * Activates the probe by generating all the corresponding diodes that are ready to start taking measurements
     * 
     * @returns {Boolean} true when an end diode has been generated
     */
    probe.activate = function activate() {
        var hasEnd = false;
        for (var t = 0, pe = probe.hemo.events || probe.hemo, tl = pe.length; t < tl; t++) {
            hasEnd = detect(new Diode(probe, t, pe[t], pe)).isEnd || hasEnd;
        }
        probe.emitter.at(probe.emitter.options.errorEvent, function testErrorListener(err, artery, pulse) { // validate errors
            if (artery.id !== probe.hemo.id) return;
            if (err instanceof Error) probe.oxm.read(probe.markerError, true, null, true);
        });
        hasEnd = hasEnd || detect(new Diode(probe, -1, probe.emitter.options.endEvent));
        return hasEnd;
    };
    
    /**
     * Reads the passed diode measurement
     * 
     * @arg {Diode} diode the diode that took the reading
     * @arg {Boolean} register true to indicate the read is a result of initializing the diode 
     */
    probe.read = function read(diode, register) {
        var v = register ? diode.isEnd ? 1 : probe.hemo.repeat * diode.heme.repeat : null;
        probe.oxm.read(probe.marker + ' ' + diode.marker, !register && diode.isEnd, v);
    };
    Object.seal(probe);
}

/**
 * Diode used to detect pulse emissions for a single type of event
 * 
 * @class
 * @private
 * @arg {Probe} probe the probe the diode is connected to
 * @arg {Integer} slot the unique slot number that the diode is assigned to on the probe
 * @arg {(String | Object)} event either the event name or an object with an event name that indicates what the diode will be measuring emissions for
 * @arg {Object} events the probe's hemo events that designates the source of the diodes origin at the given slot
 */
function Diode(probe, slot, event, events) {
    var diode = this, pcnt;
    diode.probe = probe;
    Object.seal(diode.heme = pulselet(diode.probe.hemo, event, diode.probe.emitter.options.endEvent));
    diode.test = typeof event === 'object' && event.__test ? event.__test : {};
    if (events) events[slot] = hemit(events[slot], diode.heme.id);
    //console.dir({ event: event, test: diode.heme });
    diode.slot = slot;
    diode.isEnd = diode.heme.event === diode.probe.emitter.options.endEvent;
    diode.count = 0;
    diode.marker = (diode.heme.id || '') + ' ' + diode.heme.event + (!!~diode.slot ? '[' + diode.slot + ']' : '');
    
    /**
     * Absorbs/reads an artery/pulse for measurement
     * 
     * @arg {Object} artery the artery being measured
     * @arg {Object} pulse the pulse being measured
     * @returns {Object} object that indicates if the reading is bleeding out from unrelated arteries
     */
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

/**
 * Determines if an artery exists in other slots
 * 
 * @private
 * @arg {Object} artery the artery being measured
 * @arg {Oximeter} oximeter the oximeter taking the measurement
 * @arg {Integer} slot the unique slot number that the artery's probe is assigned to on the oximeter
 * @returns {Object} object that indicates if the reading is bleeding out from unrelated arteries
 */
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

/**
 * Console banner output
 * 
 * @private
 * @arg {...*} arguments the arguments that will be formatted in the console output
 */
function banner() {
    console.log('------------ %s ------------', util.format.apply(util.format, arguments));
}