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
    var opts = plet.merge({
        endEvent: 'end', 
        errorEvent: 'error',
        emitErrors: false
    }, options, true);
    events.EventEmitter.call(this);
    this.endEvent = opts.endEvent;
    this.errorEvent = opts.errorEvent;

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
        return listen(this, opts, type, listener);
    };
    
    /**
     * @inheritdoc
     */
    PulseEmitter.prototype.once = function once(type, listener) {
        return listen(this, opts, type, listener, 'once');
    };
    
    /**
     * @inheritdoc
     */
    PulseEmitter.prototype.on = PulseEmitter.prototype.addListener;
    
    /**
     * Same as `on` and `addListener` counterparts except the only events emitted with be events emitted via `pump`
     *
     * @callback listener
     * @arg {String} type the event type
     * @arg {listener} listener the listener function(artery, pulse, [...argument])
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.at = function at(type, listener) {
        return listen(this, opts, type, listener, null, true);
    };

    /**
     * Handles errors by emitting the corresponding event(s)
     * 
     * @emits the error event set in the pulse emitter's options passing in the {Error} in error listeners
     * @arg {Error} err the error to emit proceeded by an end event when "end" is true
     * @arg {Boolean} async true to emit the error asynchronously
     * @arg {Boolean} end true to emit the end event set in the pulse emitter's options
     * @arg {Array} ignores optional array of error.code that will be ignored
     * @returns {Error} the error when emission has occurred
     */
    PulseEmitter.prototype.error = function error(err, async, end, ignore) {
        if (err && (!ignores || !err.code || !!~ignores.indexOf(err.code))) {
            var args = Array.prototype.slice.call(arguments, this.error.length);
            (async ? this.emitAsync : this.emit).apply(this, [opts.errorEvent, err].concat(args));
            if (end) {
                (async ? this.emitAsync : this.emit).apply(this, [opts.endEvent, err].concat(args));
            }
            return err;
        }
    };
    
    /**
     * Emits asynchronously using `setImmediate` or `MutationObserver` in browsers that do not support `setImmediate`
     * 
     * @arg {Array} evts an array of event types to emit
     * @arg {...*} [arguments] arguments passed into listeners
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.emitAsync = function emitAsync(evts) {
        return plet.asyncd(this, evts, 'emit', arguments, this.emitAsync);
    };
    
    /**
     * Emits after all the supplied event types have been emitted
     * 
     * @arg {(Array | Object)} evts an array of event types to wait for emission
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.after = function after(evts) {
        infuse(this, opts, evts);
        return this;
    };
    
    /**
     * Pumps a set of events into a control flow sequence. Each event 
     * 
     * @arg {(Array | Object)} evts the pulse events with or w/o control flow properties, each item can be an event type string or an object with control properties
     * @arg {(String | Object)} evts.
     * @arg {...*} [arguments] arguments passed into listeners
     * @returns {PulseEmitter} the pulse emitter
     */
    PulseEmitter.prototype.pump = function pump(evts) {
        infuse(this, opts, evts, arguments, this.pump);
    };
}

/**
 * Listens for incoming events using event emitter's add listener function, but with optional error handling and pulse event only capabilities
 * 
 * @private
 * @callback listener
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Object} [opts] the pulse emitter options
 * @arg {String} type the event type
 * @arg {listener} listener the function to execute when the event type is emitted
 * @arg {String} [fnm=addListener] the optional function name that will be called on the pulse emitter
 * @arg {Boolean} [at=false] true to only execute the listener when the event is coming from a pump execution
 * @returns {PulseEmitter} the pulse emitter
 */
function listen(pw, opts, type, listener, fnm, at) {
    var fn = function pulseListener(artery, pulse) {
        if (at && !(artery instanceof cat.Artery)) {
            return; // not a pulse event
        }
        if (pulse.emitErrors || (pulse.emitErrors !== false && artery.emitErrors) || 
            (pulse.emitErrors !== false && artery.emitErrors !== false && opts.emitErrors)) {
            try {
                return listener.apply(this, arguments);
            } catch (e) {
                e.emitter = {
                    listener: listener,
                    artery: artery,
                    pulse: pulse,
                    arguments: Array.prototype.slice.apply(arguments, fn.length)
                };
                return pw.error(e);
            }
        }
        return listener.apply(this, arguments);
    };
    fn._callback = listener;
    return PulseEmitter.super_.prototype[fnm || 'addListener'].call(pw, type, fn);
}

/**
 * Emits event(s) after a given number of events are received
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Object} [options={}] the pulse emitter options
 * @arg {(Object | Array)} evts the events to pump through the catheter
 * @arg {...*} [args] the arguments that will be propagated to the emitter
 * @arg {function} [fn] the function.length that will be used to determine the starting index of the args
 * @returns {Array} the pumped I.V.
 */
function infuse(pw, options, evts, args, fn) {
    var iv = cat(pw, options, args && fn ? Array.prototype.slice.call(args, fn.length) : null);
    return iv.pump(evts, true);
}