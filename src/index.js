const TouchPortalAPI = require("touchportal-api");
const zeromq = require("zeromq");
const cron = require("node-cron");
const batteryMonitor = require("./battery-monitor");
const pluginInfo = require("./plugin.json");

const TPClient = new TouchPortalAPI.Client();
/** @type {zeromq.Request} */
let outSocket;
/** @type {cron.ScheduledTask} */
let cronTask;

const ACTION_HANDLERS = {
	"extra-connectors.keyboard-lock-state.action": data => {
		/** @type {"Toggle"|"Enable"|"Disable"} */
		const { value } = data.find(x => x.id === "extra-connectors.keyboard-lock-state.action-value") || {};
		TPClient.logIt("INFO", "Change Keyboard Lock", value);

		// if KeyboardLocker not running, this will break when being called a 2nd time
		// "Error: Socket is busy writing; only one send operation may be in progress at any time"
		// turns out I wasn't 'await'-ing here so that might help
		if (outSocket)
			outSocket.send(["ChangeKeyboardLockState", value])
	}
};

/** @type {Record<string, {id: string, valueProcessor: (v: string) => string | Promise<string>}>} */
const STATE_FOR_TOPIC = {
	ChangeKeyboardLockState: {
		id: "extra-connectors.keyboard-lock-state.state",
		valueProcessor: value => value === "true" ? "Locked" : "Unlocked"
	},
	BatteryMonitorUpdate: {
		id: "extra-connectors.battery-monitor.state-image",
		valueProcessor: async value => batteryMonitor.createImage64(JSON.parse(value))
	},
};

async function init() {
	// create input socket on port 5555
	const inSocket = new zeromq.Reply();
	await inSocket.bind("tcp://*:5555");

	outSocket = new zeromq.Request();
	outSocket.connect("tcp://localhost:5556");

	const inSocketHandler = async () => {
		// wait for messages and log them
		for await (const [topicBuf, msgBuf] of inSocket) {
			// send reply
			inSocket.send("ACK");

			// convert topic and msg to string
			const topic = topicBuf.toString();
			const msg = msgBuf.toString();

			// log topic and msg
			TPClient.logIt("INFO", "Message:", topic, msg);

			// find state id for topic
			const stateInfo = STATE_FOR_TOPIC[topic];
			if (!stateInfo) {
				TPClient.logIt("WARN", "Unknown Topic", topic);
				continue;
			}

			let finalValue = stateInfo.valueProcessor ? stateInfo.valueProcessor(msg) : msg;
			if (finalValue instanceof Promise)
				finalValue = await finalValue;

			// update state
			TPClient.stateUpdate(stateInfo.id, finalValue);
		}
	};

	const outSocketHandler = async () => {
		for await (const [msg] of outSocket) {
			TPClient.logIt("INFO", "Reply:", msg.toString());
		}
	};

	if (cronTask)
		cronTask.stop();

	// start cron task that runs every minute
	cronTask = cron.schedule("* * * * *", () => {
		TPClient.stateUpdate(
			"extra-connectors.current-time.state",
			// using hourCycle=h23 instead of hour12=false due to a bug (https://stackoverflow.com/a/68646518/8161100)
			new Date().toLocaleTimeString("en-US", { hourCycle: "h23", hour: "numeric", minute: "numeric" })
		);
	}, { runOnInit: true });

	inSocketHandler().catch(err => TPClient.logIt("ERROR", "IN SOCKET ERROR:", err.stack || err));
	outSocketHandler().catch(err => TPClient.logIt("ERROR", "OUT SOCKET ERROR:", err.stack || err));

	// log done
	TPClient.logIt("INFO", "Keyboard Locker", "Initialization Complete");
}

TPClient.on("Action", async (data) => {
	const { actionId } = data;
	const handler = ACTION_HANDLERS[actionId];
	if (handler)
		handler(data.data);
	else
		TPClient.logIt("WARN", "Unknown Action", actionId);
});

TPClient.on("connected", () => {
	TPClient.logIt("INFO", "CONNECTED");
	init().catch(err => TPClient.logIt("ERROR", "INIT ERROR", err));
});

TPClient.connect({ pluginId: pluginInfo.id });
