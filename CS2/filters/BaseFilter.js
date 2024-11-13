// filters/BaseFilter.js
class BaseFilter {
    async process(input) {
        throw new Error('Process method must be implemented');
    }
}