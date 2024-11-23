// rabbitmq.js
const amqp = require('amqplib');
let channel, connection;

async function connect() {
  connection = await amqp.connect('amqp://localhost');
  channel = await connection.createChannel();  
}

async function sendToQueue(queue, message) {
  if (!channel) {
    await connect();
  }
  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(message), { persistent: true });
}

module.exports = { connect, sendToQueue };
