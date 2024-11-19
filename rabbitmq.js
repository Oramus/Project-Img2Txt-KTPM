const amqp = require('amqplib');

let channel;
let connection;

async function connect() {
    try {
        connection = await amqp.connect('amqp://localhost');
        channel = await connection.createChannel();
        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Error connecting to RabbitMQ:', error);
    }
}

async function sendToQueue(queue, message) {
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(message), { persistent: true });
    console.log(`Sent message to ${queue}: ${message}`);
}

async function consumeQueue(queue, callback) {
    await channel.assertQueue(queue, { durable: true });
    channel.consume(queue, (msg) => {
        if (msg !== null) {
            callback(msg.content.toString());
            channel.ack(msg);
        }
    }, { noAck: false });
}

module.exports = {
    connect,
    sendToQueue,
    consumeQueue
};
