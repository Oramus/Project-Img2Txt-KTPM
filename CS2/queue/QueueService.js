// queue/QueueService.js
const amqp = require('amqplib');
const logger = require('../utils/logger');

class QueueService {
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    async connect() {
        try {
            this.connection = await amqp.connect('amqp://localhost');
            this.channel = await this.connection.createChannel();
            
            // Define queues
            await this.channel.assertQueue('image_processing', { durable: true });
            await this.channel.assertQueue('error_queue', { durable: true });
            
            logger.info('Connected to RabbitMQ');
        } catch (error) {
            logger.error(`Failed to connect to RabbitMQ: ${error.message}`);
            throw error;
        }
    }

    async publish(queue, data) {
        try {
            await this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), {
                persistent: true
            });
            logger.info(`Message published to queue: ${queue}`);
        } catch (error) {
            logger.error(`Failed to publish message: ${error.message}`);
            throw error;
        }
    }

    async consume(queue, callback) {
        try {
            await this.channel.consume(queue, async (msg) => {
                if (msg) {
                    try {
                        const data = JSON.parse(msg.content.toString());
                        await callback(data);
                        this.channel.ack(msg);
                    } catch (error) {
                        logger.error(`Error processing message: ${error.message}`);
                        // Move to error queue after 3 retries
                        if (msg.properties.headers['x-death'] && 
                            msg.properties.headers['x-death'][0].count >= 3) {
                            this.channel.sendToQueue('error_queue', msg.content);
                            this.channel.ack(msg);
                        } else {
                            this.channel.nack(msg);
                        }
                    }
                }
            });
            logger.info(`Consumer started for queue: ${queue}`);
        } catch (error) {
            logger.error(`Failed to start consumer: ${error.message}`);
            throw error;
        }
    }

    async close() {
        try {
            await this.channel.close();
            await this.connection.close();
            logger.info('Disconnected from RabbitMQ');
        } catch (error) {
            logger.error(`Failed to close RabbitMQ connection: ${error.message}`);
            throw error;
        }
    }
}