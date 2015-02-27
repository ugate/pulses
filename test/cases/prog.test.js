
/**
 * Simple test cases without JSON definitions
 * 
 * @returns {Array} a the array of tests that will be ran
 */
module.exports = function progTests() {
    var p = [], i = -1;
    
    p[++i] = ['one', 'two', 'three'];
    p[i].repeat = 2;
    
    p[++i] = ['one', { event: 'two', repeat: 5, __test: { pass: ['A', 'B', 'C'] } }, 'three'];
    p[i].repeat = 2;
    p[i].type = 'sync';
    
    p[++i] = { events: ['one-2', 'two-2', 'three-2'], type: 'sync', __test: { pass: ['E', 'F', 'G'] } };
    
    p[++i] = { events: ['one-3', 'two-3', { event: 'three-3', type: 'sync', __test: { pass: ['1', 2, '3', true] } }, { event: 'four-3', type: 'sync' }] };

    return p;
};