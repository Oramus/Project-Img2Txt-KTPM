// rabbitmq.js
const amqp = require('amqplib');
let channel, connection;

async function connect() {
  connection = await amqp.connect('amqp://localhost');  // Kết nối tới RabbitMQ
  channel = await connection.createChannel();  // Tạo một channel mới
}

async function sendToQueue(queue, message) {
  if (!channel) {
    await connect();  // Nếu channel chưa được tạo, hãy gọi connect() để đảm bảo kết nối
  }
  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(message), { persistent: true });
}

module.exports = { connect, sendToQueue };
