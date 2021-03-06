'use strict';

var util = require('util');
var events = require('events');
var plet = require('./lib/platelets.js');
var cat = require('./lib/catheter.js');

util.inherits(PulseEmitter, events.EventEmitter);

var pulses = exports, catType = 'internal';
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
    return listens(this, type, null, false);
};

/**
 * @inheritdoc
 */
PulseEmitter.prototype.removeListener = function removeListener(type, listener) {
    return listens(this, type, listener || null, true);
};

/**
 * @inheritdoc
 */
PulseEmitter.prototype.removeAllListeners = function removeAllListeners(type) {
    return listens(this, type, undefined, true);
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
 * @arg {String} type the event type
 * @arg {pulseListener} listener the listener function called when the pulse event type is emitted
 * @arg {String} [retrofit] a flag that indicates a pattern to mimic (e.g. "callback" would pass in pending arguments to the listener with an auto-generated callback function as the last argument and would pass the callback results into the next waiting listeners in the chain; if the first argument is an Error it will emit/throw accordingly)
 * @arg {...*} [arguments] additional "passes" argument names that will automatically be set on the auto-generated callback's artery.passes by name in order and preceeding any arguments in artery.pass 
 * @returns {PulseEmitter} the pulse emitter
 */
PulseEmitter.prototype.at = function at(type, listener, retrofit) {
    return listen(this, type, listener, null, retrofit || true, arguments.length > at.length ? Array.prototype.slice.apply(at.length - 1) : null);
};

/**
 * Pulse emitter listeners
 * 
 * @callback PulseEmitter~pulseListener
 * @arg {Object} artery event chain state
 * @arg {String} artery.type the emission execution type applied to the event chain- async, sync, fork, spawn, exec
 * @arg {Integer} artery.repeat the number of times that the event chain will/has been repeated
 * @arg {*[]} artery.data a mutable array for storing data throughout the life-cycle of the event chain
 * @arg {Object} artery.passes a mutable object for adding properties/values to that will be passed into any subsiquent listeners whose event.passes has an entry with the same name (listener arguments: artery, pulse, [arguments from artery.passes in the order defined in event.passes, ...], [arguments from artery.pass in order of insertion...])
 * @arg {*[]} artery.pass a mutable array for adding arguments that will be passed into the next listener functions in the event chain (cleared after each emission)
 * @arg {*} [artery.id] an identifier assigned to the event chain
 * @arg {Object} [artery.inbound] an object that defines how external events interact with event chain continuity
 * @arg {String} [artery.inbound.event] the event name to listen for on an inbound target selection that, when triggered, will capture results and possibly continue event chain execution
 * @arg {Integer} [artery.inbound.repeat=1] the number of times that the inbound event will be captured before resuming event chain execution
 * @arg {Number} [artery.inbound.debounce] duration period in milliseconds to wait before counting consecutive inbound events towards the inbound repeat value
 * @arg {Number} [artery.inbound.timeout] duration period in milliseconds to wait before resuming event chain execution
 * @arg {String} [artery.inbound.selector] the query selector applied to an inbound target that captures the element(s) that will be listened to (browser only)
 * @arg {Object} pulse the current event state
 * @arg {String} pulse.event the event name
 * @arg {String} pulse.type the event type
 * @arg {Integer} pulse.repeat the number of times that the event will/has been repeated
 * @arg {*} [pulse.id] an arbitrary identifier assigned to the individual event
 * @arg {Object} [pulse.inbound] an object that defines how external events interact with the current event's continuity in relation to the event chain
 * @arg {String} [pulse.inbound.event] the event name to listen for on an inbound target selection that, when triggered, will capture results and possibly continue event chain execution
 * @arg {Integer} [pulse.inbound.repeat=1] the number of times that the inbound event will be captured before resuming event chain execution
 * @arg {Number} [pulse.inbound.debounce] duration period in milliseconds to wait before counting consecutive inbound events towards the inbound repeat value
 * @arg {Number} [pulse.inbound.timeout] duration period in milliseconds to wait before resuming event chain execution
 * @arg {String} [pulse.inbound.selector] the query selector applied to an inbound target that captures the element(s) that will be listened to (browser only)
 * @arg {...*} [arguments] additional arguments passed by the previous listener's artery.pass followed by any arguments passed during initial chain emission
 */

/**
 * Emits pulse events through a control flow chain sequence 
 * 
 * @arg {(Array | Object)} evts the pulse events that will be emitted in sequence (order determined by asynchronicity)
 * @arg {String} [evts.type=async] the emission execution type applied to the event chain- async, sync, fork, spawn, exec (fork/spawn/exec will use Workers within browsers)
 * @arg {Integer} [evts.repeat=1] the number of times that the event chain will be repeated
 * @arg {*} [evts.id] an arbitrary identifier assigned to the event chain
 * @arg {Object} [evts.inbound] an object that defines how external events interact with event chain continuity
 * @arg {String} [evts.inbound.event] the event name to listen for on an inbound target selection that, when triggered, will capture results and possibly continue event chain execution
 * @arg {Integer} [evts.inbound.repeat=1] the number of times that the inbound event will be captured before resuming event chain execution
 * @arg {Number} [evts.inbound.debounce] duration period in milliseconds to wait before counting consecutive inbound events towards the inbound repeat value
 * @arg {Number} [evts.inbound.timeout] duration period in milliseconds to wait before resuming event chain execution
 * @arg {String} [evts.inbound.selector] the query selector applied to an inbound target that captures the element(s) that will be listened to (browser only)
 * @arg {(Object | String)} evts[] either the event name or an object containing event properties
 * @arg {String} [evts[].event] the event name
 * @arg {String} [evts[].type] overrides the inherited type value from the event chain
 * @arg {Integer} [evts[].repeat] overrides the inherited repeat value from the event chain
 * @arg {*} [evts[].id] an arbitrary identifier assigned to the individual event
 * @arg {Array} [evts[].passes] a set of property names whose values will be passed into subsequent listeners when an artery.passes property exists with the same name (listener arguments: artery, pulse, [arguments from artery.passes in the order defined in event.passes, ...], [arguments from artery.pass in order of insertion...])
 * @arg {Object} [evts[].inbound] an object that defines how external inbound events interact with the current event's continuity in relation to the event chain
 * @arg {String} [evts[].inbound.event] the event name to listen for on an inbound target selection that, when triggered, will capture results and possibly continue event chain execution
 * @arg {Integer} [evts[].inbound.repeat=1] the number of times that the inbound event will be captured before resuming event chain execution
 * @arg {Number} [evts[].inbound.debounce] duration period in milliseconds to wait before counting consecutive inbound events towards the inbound repeat value
 * @arg {Number} [evts[].inbound.timeout] duration period in milliseconds to wait before resuming event chain execution
 * @arg {String} [evts[].inbound.selector] the query selector applied to an inbound target that captures the element(s) that will be listened to (browser only)
 * @arg {Object} [passes={}] the initial artery.passes object containing properties/values that will be passed into any pulse listener whose event.passes has an entry with the same name (listener arguments: artery, pulse, [arguments from artery.passes in the order defined in event.passes, ...], [arguments from artery.pass in order of insertion...])
 * @arg {Object} [inboundTarget=pulseEmitter] a target that will emit inbound event traffic to inbound pulse event listeners- can be a *EventTarget* (browser) or an *EventEmitter*
 * @arg {...*} [arguments] additional arguments appeneded to the arguments passed into the first listener in the chain (after: artery, pulse, [pass by reference arguments in alphabetical order, ...], [arguments...])
 * @returns {PulseEmitter} the pulse emitter
 */
PulseEmitter.prototype.to = function to(evts, passes, inboundTarget) {
    var fl = to.length, pw = this;
    var iv = cat(pw, function toListener(type, listener) {
        listen(pw, type, listener, null, true, catType);
    }, inboundTarget, passes, arguments.length > fl ? Array.prototype.slice.call(arguments, fl) : null);
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
    return plet.asyncd(this, evts, 'emit', arguments.length > emitAsync.length ? Array.prototype.slice.call(arguments, emitAsync.length) : null);
};

/**
 * Handles errors by emitting the corresponding event(s)
 * 
 * @emits the error event set in the pulse emitter's options passing in the {Error} in error listeners
 * @arg {Error} err the error to emit
 * @arg {*} [async] truthy for determining emission type (strings that end with *sync*, but not *async* will emit synchronously)
 * @arg {Boolean} [end] true to emit the end event set in the pulse emitter's options after error emission
 * @arg {*[]} [ignores] array of error.code that will be ignored
 * @arg {...*} [arguments] arguments passed to the emitter (error will always be the first argument passed)
 * @returns {Error} the error when emission has occurred or undefined when it has not
 */
PulseEmitter.prototype.error = function errored(err, async, end, ignores) {
    var args = arguments.length > errored.length ? Array.prototype.slice.call(arguments, errored.length) : null;
    return emitError(err, async, args, end, ignores);
};

/**
 * Listens for incoming events using event emitter's add listener function, but with optional error handling and pulse event only capabilities
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {String} type the event type
 * @arg {function} listener the function to execute when the event type is emitted
 * @arg {String} [fnm=addListener] the optional function name that will be called on the pulse emitter
 * @arg {(String | Boolean)} [rf] a flag that indicates a pattern to mimic (e.g. "callback" would pass in pending arguments to the listener with an auto-generated callback function 
 *                          as the last argument and would pass the callback results into the next waiting listeners in the chain; if the first argument is an Error it will emit/throw 
 *                          accordingly)
 * @arg {Array} [passes] an array of names that will automatically be set on the auto-generated callback's artery.passes by name in order and preceeding any arguments in artery.pass
 * @returns {PulseEmitter} the pulse emitter
 */
function listen(pw, type, listener, fnm, rf, cbtype, passes) {
    var fn = function pulseListener(flow, artery, pulse) {
        if (!rf || !(artery instanceof cat.Artery) || !(pulse instanceof cat.Pulse) || flow instanceof Error)
            return arguments.length ? fn._callback.apply(pw, Array.prototype.slice.call(arguments)) : fn._callback.call(pw);
        var isRfCb = rf === 'callback', emitErrs = pulse.emitErrors || (pulse.emitErrors !== false && artery.emitErrors) || 
            (pulse.emitErrors !== false && artery.emitErrors !== false && pw.options && pw.options.emitErrors);
        var args = arguments.length > fn.length ?  Array.prototype.slice.call(arguments, isRfCb ? fn.length : 1) : null;
        if (isRfCb) {
            (args = args || []).push(function retrofitCb(err) { // last argument should be the callback function
                if (err instanceof Error) emitError(pw, err, pulse.type, [artery, pulse]); // emit any callback errors
                var pi = 0, al;
                if (passes) for (var pl = passes.length; pi < pl; ++pi) {
                    artery.passes[passes[pi]] = arguments[pi]; // pass by name before any other arguments are passed
                }
                if ((al = arguments.length - (pi += pi > 0)) === 1) artery.pass.push(arguments[pi]);
                else if (al) artery.pass.push.apply(artery.pass, Array.prototype.slice.call(arguments, pi));
            });
        }
        if (emitErrs) {
            try {
                args && args.length ? fn._callback.apply(pw, args) : fn._callback.call(pw, artery, pulse);
            } catch (e) {
                emitError(pw, e, pulse.type, [artery, pulse]);
            }
        } else args && args.length ? fn._callback.apply(pw, args) : fn._callback.call(pw, artery, pulse);
    };
    fn._callback = listener;
    if (cbtype) fn._cbtype = cbtype;
    return PulseEmitter.super_.prototype[fnm || 'addListener'].call(pw, type, fn);
}

/**
 * Handles errors by emitting the corresponding event(s)
 * 
 * @private
 * @emits the error event set in the pulse emitter's options passing in the {Error} in error listeners
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {Error} err the error to emit
 * @arg {*} [async] truthy for determining emission type (strings that end with *sync*, but not *async* will emit synchronously)
 * @arg {*[]} [args] additional arguments to pass into the emission (first argument will always be the error)
 * @arg {Boolean} [end] true to emit the end event set in the pulse emitter's options after error emission
 * @arg {*[]} [ignores] array of error.code that will be ignored
 * @returns {Error} the error when emission has occurred or undefined when it has not
 */
function emitError(pw, err, async, args, end, ignores) {
    if (err && (!ignores || !err.code || !!~ignores.indexOf(err.code))) {
        var m = (typeof async === 'string' && !/^[^a]{0,}sync/i.test(async)) || async ? pw.emitAsync : pw.emit;
        if (args) {
            var ea = [pw.options.errorEvent, err];
            ea.push.apply(ea, args);
            m.apply(pw, ea);
            if (end) m.apply(pw, ea);
        } else {
            m.call(pw, pw.options.errorEvent, err);
            if (end) m.call(pw, pw.options.endEvent, err);
        }
        return err;
    }
}

/**
 * Either removes listener(s) by type (and optionally by listener) or captures a list of listeners
 * 
 * @private
 * @arg {PulseEmitter} pw the pulse emitter
 * @arg {String} type the event type
 * @arg {function} [listener] the listener function to to remove (undefined will remove all non-internal listeners)
 * @arg {Boolean} [remove] true to remove the specified external listener
 * @returns {(PulseEmitter | function[])} the pulse emitter when removing, otherwise a list of listeners
 */
function listens(pw, type, listener, remove) {
    for (var i = 0, ls = PulseEmitter.super_.prototype.listeners.call(pw, type), l = ls.length, lu = typeof listener === 'undefined'; i < l; i++) {
        if (remove && ls[i]._callback === listener) return PulseEmitter.super_.prototype.removeListener.call(pw, type, ls[i]);
        else if (remove && lu && ls[i]._cbtype !== catType) PulseEmitter.super_.prototype.removeListener.call(pw, type, ls[i]);
        else if (!remove && ls[i]._callback) ls.splice(i, 1, ls[i]._cbtype === catType ? undefined : ls[i]._callback);
    }
    return remove ? pw : ls;
}