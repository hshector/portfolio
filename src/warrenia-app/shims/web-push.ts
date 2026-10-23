// web-push sends notifications from a server: the demo has none (Alerts shows the signal log).
const unavailable = (..._args: unknown[]): never => {
  throw new Error('Push notifications are not available in the demo');
};
export default { setVapidDetails: unavailable, sendNotification: unavailable };
