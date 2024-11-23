// utils/circuit-breaker.js
class CircuitBreaker {
    constructor(requestFn, options = {}) {
      this.requestFn = requestFn;
      this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
      this.failureCount = 0;
      this.successCount = 0;
      this.lastFailureTime = null;
      this.options = {
        failureThreshold: options.failureThreshold || 5,    // Số lần fail tối đa
        resetTimeout: options.resetTimeout || 60000,        // Thời gian reset (ms)
        halfOpenSuccess: options.halfOpenSuccess || 3,      // Số lần success để đóng lại circuit
        monitorInterval: options.monitorInterval || 10000   // Thời gian kiểm tra trạng thái
      };
  
      setInterval(() => this.monitorState(), this.options.monitorInterval);
    }
  
    async monitorState() {
      if (this.state === 'OPEN' && 
          Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log('Circuit Breaker chuyển sang trạng thái HALF_OPEN');
      }
    }
  
    async exec(...args) {
      if (this.state === 'OPEN') {
        throw new Error('Circuit breaker is OPEN');
      }
  
      try {
        const result = await this.requestFn(...args);
        this.handleSuccess();
        return result;
      } catch (error) {
        this.handleFailure();
        throw error;
      }
    }
  
    handleSuccess() {
      this.failureCount = 0;
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= this.options.halfOpenSuccess) {
          this.state = 'CLOSED';
          this.successCount = 0;
          console.log('Circuit Breaker đã đóng lại');
        }
      }
    }
  
    handleFailure() {
      this.failureCount++;
      this.lastFailureTime = Date.now();
  
      if (this.state === 'CLOSED' && 
          this.failureCount >= this.options.failureThreshold) {
        this.state = 'OPEN';
        console.log('Circuit Breaker đã mở do nhiều lỗi');
      } else if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        console.log('Circuit Breaker quay lại trạng thái OPEN do lỗi trong HALF_OPEN');
      }
    }
  
    getState() {
      return this.state;
    }
  }
  
  module.exports = CircuitBreaker;