const TouchPortalAPI = require("touchportal-api");
const zeromq = require("zeromq");
const pluginInfo = require("./plugin.json");

const TPClient = new TouchPortalAPI.Client();
/** @type {zeromq.Request} */
let outSocket;

const ACTION_HANDLERS = {
	"extra-connectors.keyboard-lock-state.action": data => {
		/** @type {"Toggle"|"Enable"|"Disable"} */
		const { value } = data.find(x => x.id === "extra-connectors.keyboard-lock-state.action-value") || {};
		TPClient.logIt("INFO", "Change Keyboard Lock", value);

		if (outSocket)
			outSocket.send(["ChangeKeyboardLockState", value])
	}
};

const STATE_FOR_TOPIC = {
	ChangeKeyboardLockState: {
		id: "extra-connectors.keyboard-lock-state.state",
		valueProcessor: value => value === "true" ? "Locked" : "Unlocked"
	},
};

async function init() {
	// create input socket on port 5555
	const inSocket = new zeromq.Reply();
	await inSocket.bind("tcp://*:5555");

	outSocket = new zeromq.Request();
	outSocket.connect("tcp://localhost:5556");

	const subHandler = async () => {
		// wait for messages and log them
		for await (const [topicBuf, msgBuf] of inSocket) {
			// convert topic and msg to string
			const topic = topicBuf.toString();
			const msg = msgBuf.toString();

			// log topic and msg
			TPClient.logIt("INFO", "Message", topic, msg);

			// find state id for topic
			const stateInfo = STATE_FOR_TOPIC[topic];
			if (!stateInfo) {
				TPClient.logIt("WARN", "Unknown Topic", topic);
				inSocket.send("ERROR");
				continue;
			}

			const finalValue = stateInfo.valueProcessor ? stateInfo.valueProcessor(msg) : msg;

			// update state
			TPClient.stateUpdate(stateInfo.id, finalValue);

			// send reply
			inSocket.send("OK");
		}
	};

	const reqHandler = async () => {
		for await (const [msg] of outSocket) {
			TPClient.logIt("INFO", "Reply:", msg.toString());
		}
	};

	subHandler().catch(err => TPClient.logIt("ERROR", "SUB ERROR", err));
	reqHandler().catch(err => TPClient.logIt("ERROR", "REQ ERROR", err));

	// log done
	TPClient.logIt("INFO", "Keyboard Locker", "DONE");
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
