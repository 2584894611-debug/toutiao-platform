import { createServer } from 'http';
import next from 'next';

const isProduction =
  process.env.COZE_PROJECT_ENV === 'PROD' ||
  process.env.NODE_ENV === 'production';
const dev = !isProduction;
// 部署环境下 Node 的 HOSTNAME 通常为容器内部 hostname（如 vmtpxcp6-xxx），
// 直接传给 Next 会导致内部主机名校验/请求路由异常，且 listen 必须绑 0.0.0.0
// 才能接受外部健康检查与流量。开发环境下保持 localhost 以便本机调试。
const bindHost = '0.0.0.0';
const nextHostname = dev ? 'localhost' : bindHost;
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname: nextHostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, bindHost, () => {
    console.log(
      `> Server listening at http://${bindHost}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
});
