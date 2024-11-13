// config/rabbitmq.js
const amqp = require('amqplib');

class MessageQueue {
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    async connect() {
        try {
            this.connection = await amqp.connect('amqp://guest:guest@localhost:5672');
            this.channel = await this.connection.createChannel();
            console.log('Connected to RabbitMQ');
        } catch (error) {
            console.error('Error connecting to RabbitMQ:', error);
            throw error;
        }
    }

    async createQueue(queueName) {
        try {
            await this.channel.assertQueue(queueName, { durable: true });
            console.log(`Queue ${queueName} created successfully`);
        } catch (error) {
            console.error(`Error creating queue ${queueName}:`, error);
            throw error;
        }
    }

    async sendToQueue(queueName, data) {
        try {
            await this.channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), {
                persistent: true
            });
            console.log(`Message sent to queue ${queueName}`);
        } catch (error) {
            console.error(`Error sending message to queue ${queueName}:`, error);
            throw error;
        }
    }

    async consume(queueName, callback) {
        try {
            await this.channel.consume(queueName, async (msg) => {
                if (msg !== null) {
                    const data = JSON.parse(msg.content.toString());
                    await callback(data);
                    this.channel.ack(msg);
                }
            });
            console.log(`Started consuming from queue ${queueName}`);
        } catch (error) {
            console.error(`Error consuming from queue ${queueName}:`, error);
            throw error;
        }
    }
}

module.exports = new MessageQueue();