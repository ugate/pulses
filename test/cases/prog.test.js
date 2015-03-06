
/**
 * Simple test cases without JSON definitions
 * 
 * @returns {*[]} an array of tests that will be ran
 */
module.exports = function progTests() {
    var p = [], i = -1;
    
    p[++i] = ['cb1', { event: 'cb2', __test: { pass: ['cb2-out-1', 'cb2-out-1'] } }, { event: 'cb3', __test: { retrofit: { args: ['cb3-out-1'] } } }, 'cb4'];
    p[i].repeat = 2;
    
    p[++i] = ['cbs1', { event: 'cbs2', __test: { pass: ['cbs2-out-1', 'cbs2-out-1'] } }, { event: 'cbs3', type: 'sync', __test: { retrofit: { args: [new Error('cbs3-out-error'), 'cbs3-out-1'] } } }, 'cbs4'];
    p[i].repeat = 2;

    p[++i] = ['one', 'two', 'three'];
    p[i].repeat = 2;
    
    p[++i] = ['one', { event: 'two', repeat: 5, __test: { pass: ['A', 'B', 'C'] } }, 'three'];
    p[i].repeat = 2;
    p[i].type = 'sync';
    
    p[++i] = { events: ['one-2', 'two-2', 'three-2'], type: 'sync', __test: { pass: ['E', 'F', 'G'] } };
    
    p[++i] = { events: ['one-3', 'two-3', { event: 'three-3', type: 'sync', __test: { pass: ['1', 2, '3', true] } }, { event: 'four-3', type: 'sync' }] };
    
    return p;
};