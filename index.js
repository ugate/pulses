'use strict';

var util = require('util');
var events = require('events');
var plet = require('./lib/platelets.js');
var cat = require('./lib/catheter.js');

util.inherits(PulseEmitter, events.EventEmitter);

var pulses = exports;
pulses.PulseEmitter = PulseEmitter;
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
    this.options = Object.freeze(plet.merge({
        endEvent: 'end', 
        errorEvent: 'error',
        emitErrors: false
    }, options, true, true, true));
    events.EventEmitter.call(this);
}

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
    return listen(this, type, listener);
};

/**
 * @inheritdoc
 */
PulseEmitter.prototype.once = function once(type, listener) {
    return listen(this, type, listener, 'once');
};

/**
 * @inheritdoc
 */
PulseEmitter.prototype.on = PulseEmitter.prototype.addListener;

/**
 * Same as **on** and **addListener** counterparts except the only events emitted within a **to** control chain sequence or a bound target will be listened to
 *
 * @callback listener
 * @arg {String} type the event type
 * @arg {pulseListener} listener the listener function called when the pulse event type is emitted
 * @arg {String} retrofit a flag indicating a type of retrofit will be applied to the listener e.g. function(error, [... arguments])
 * @returns {PulseEmitter} the pulse emitter
 */
PulseEmitter.prototype.at = function at(type, listener, retrofit) {
    return listen(this, type, listener, null, retrofit || true);
};

/**
 * Emits pulse events through a control flow chain sequence 
 * 
 * @arg {(Array | Object)} evts the pulse events that will be emitted in sequence (order determined by asynchronicity)
 * @arg {String} [evts.type=async] the emission execution type applied to the event chain- async, sync, fork, spawn, exec (fork/spawn/exec will use Workers within browsers)
 * @arg {Integer} [evts.repeat=1] the number of times that the event chain will be repeated
 * @arg {*} [evts.id] an arbitrary identifier assigned to the event chain
 * @arg {(Object | String)} evts[] either the event name or an object containing event properties
 * @arg {String} [evts[].event] the event name
 * @arg {String} [evts[].type] overrides the inherited type value from the event chain
 * @arg {Integer} [evts[].repeat] overrides the inherited repeat value from the event chain
 * @arg {*} [evts[].id] an arbitrary identifier assigned to the individual event
 * @arg {...*} [arguments] additional arguments appeneded to the arguments passed into all listeners
 * @returns {PulseEmitter} the pulse emitter
 */
PulseEmitter.prototype.to = function to(evts) {
    var fl = this.to.length, iv = cat(this, arguments.length > fl ? Array.prototype.slice.call(arguments, fl) : null);
    iv.pump(evts, true);
};

/**
 * Emits asynchronously using **setImmediate** or **MutationObserver** in browsers that do not support **setImmediate**
 * 
 * @arg {Array} evts an array of event types to emit
 * @arg {...*} [arguments] arguments passed into listeners
 * @returns {PulseEmitter} the pulse emitter
 */
PulseEmitter.prototype.emitAsync = function emitAsync(evts) {
    return plet.asyncd(this, evts, 'emit', arguments, this.emitAsync);
};

PulseEmitter.prototype.cb = function cb(fn) {
    if (typeof emitter === 'object') {
        var fn = typeof emitter.addListener === 'function' ? emitter.addListener : 
                        typeof emitter.addEventListener === 'function' ? emitter.addEventListener : null;
        if (fn) {
            binder.push()
        }
    }
};

/**
 * Handles errors by emitting the corresponding event(s)
 * 
 * @emits the error event set in the pulse emitter's options passing in the {Error} in error listeners
 * @arg {Error} err the error to emit proceeded by an end event when "end" is true
 * @arg {Boolean} [async] true to emit the error asynchronously
 * @arg {Boolean} [end] true to emit the end event set in the pulse emitter's options
 * @arg {Array} [ignores] array of error.code that will be ignored
 * @returns {Error} the error when emission has occurred or undefined when it has not
 */
PulseEmitter.prototype.error = function error(err, async, end, ignore) {
    if (err && (!ignores || !err.code || !!~ignores.indexOf(err.code))) {
        var args = arguments.length > this.error.length ? Array.prototype.slice.call(arguments, this.error.length) : null;
        var m = async ? this.emitAsync : this.emit;
        if (args) {
            m.apply(this, [this.options.errorEvent, err].concat(args));
            if (end) m.apply(this, [this.options.endEvent, err].concat(args));
        } else {
            m.call(this, this.options.errorEvent, err);
            if (end) m.call(this, this.options.endEvent, err);
        }
        return err;
    }
};

/**
 * Pulse emitter listeners
 * 
 * @callback PulseEmitter~pulseListener
 * @arg {Object} artery event chain state
 * @arg {String} artery.type the emission execution type applied to the event chain- async, sync, fork, spawn, exec
 * @arg {Integer} artery.repeat the number of times that the event chain will/has been repeated
 * @arg {*} [artery.id] an arbitrary identifier assigned to the event chain
 * @arg {Object} pulse the current event state
 * @arg {String} pulse.event the event name
 * @arg {String} pulse.type the event type
 * @arg {Integer} pulse.repeat the number of times that the event will/has been repeated
 * @arg {*} [pulse.id] an arbitrary identifier assigned to the individual event
 * @arg {...*} [arguments] additional arguments passed into listeners from emission
 */

/**
 * Listens for incoming events using event emitter's add listener function, but with optional error handling and pulse event only capabilities
 * 
 * @private
 * @callback listener
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {String} type the event type
 * @arg {function} listener the function to execute when the event type is emitted
 * @arg {String} [fnm=addListener] the optional function name that will be called on the pulse emitter
 * @arg {Boolean} [at=false] true to only execute the listener when the event is coming from a pump execution
 * @returns {PulseEmitter} the pulse emitter
 */
function listen(pw, type, listener, fnm, rf) {
    var fn = function pulseListener(flow, artery, pulse) {
        if (rf && (!(artery instanceof cat.Artery) || !(pulse instanceof cat.Pulse))) {
            return; // not a pulse event
        }
        var args = arguments;
        if (typeof rf === 'string')
            flow.wait(function retrofit() {
                hark(pw, flow, artery, pulse, args, fn);
            });
        else hark(pw, flow, artery, pulse, args, fn);
    };
    fn._callback = listener;
    return PulseEmitter.super_.prototype[fnm || 'addListener'].call(pw, type, fn);
}

function hark(pw, flow, artery, pulse, args, fn) {
    var al = args.length, fl = fn.length, cb = fn._callback;
    if (pulse.emitErrors || (pulse.emitErrors !== false && artery.emitErrors) || 
            (pulse.emitErrors !== false && artery.emitErrors !== false && pw.options && pw.options.emitErrors)) {
        try {
            return al > fl ? cb.apply(this, Array.prototype.slice.call(args, 1)) : cb.call(this, artery, pulse);
        } catch (e) {
            e.emitter = {
                listener: cb,
                artery: artery,
                pulse: pulse,
                arguments: al > fl ? Array.prototype.slice.apply(arguments, fl): null
            };
            return pw.error(e);
        }
    }
    return al > fl ? cb.apply(this, Array.prototype.slice.call(args, 1)) : cb.call(this, artery, pulse);
}

function bind(emr, que) {
    if (typeof emr === 'object') {
        var add = typeof emr.addListener === 'function' ? emr.addListener : 
                        typeof emr.addEventListener === 'function' ? emr.addEventListener : null;
        if (add) {
            var rmv = typeof emr.removeListener === 'function' ? emr.removeListener : 
                        typeof emr.removeEventListener === 'function' ? emr.removeEventListener : null;
            que.push({ add: add, remove: rmv });
        }
    }
}