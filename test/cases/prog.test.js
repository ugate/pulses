
/**
 * Simple test cases without JSON definitions
 * 
 * @returns {Array} a the array of tests that will be ran
 */
module.exports = function progTests() {
    var p = [], i = -1;
    
    p[++i] = ['one', 'two', 'three'];
    p[i].repeat = 2;
    p[i].__args = ['A', 'B', 'C'];
    
    p[++i] = ['one', { event: 'two', repeat: 5 }, 'three'];
    p[i].repeat = 2;
    p[i].type = 'sync';
    p[i].__args = ['D', 'E', 'F'];
    
    p[++i] = { events: ['one-2', 'two-2', 'three-2'], type: 'sync' };
    p[i].__args = ['a', 'b', 'c'];
    
    p[++i] = { events: ['one-3', 'two-3', { event: 'three-3', type: 'sync' }, { event: 'four-3', type: 'sync' }] };
    p[i].__args = ['1', 2, '3', true];

    return p;
};