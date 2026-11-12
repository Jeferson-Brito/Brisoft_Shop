const os = require('os');
const { getLogs, clearLogs } = require('../services/log.service');

class SystemController {
  getStatus(req, res) {
    const memory = process.memoryUsage();
    return res.json({
      success: true,
      status: 'online',
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      memoryMb: Math.round(memory.rss / 1024 / 1024),
      pid: process.pid
    });
  }

  getLogs(req, res) {
    return res.json({ success: true, logs: getLogs(req.query.limit, req.query.level) });
  }

  clearLogs(req, res) {
    clearLogs();
    return res.json({ success: true, message: 'Logs limpos.' });
  }
}

module.exports = new SystemController();
