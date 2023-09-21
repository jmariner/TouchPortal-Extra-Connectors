const TouchPortalAPI = require("touchportal-api");
const zeromq = require("zeromq");
const pluginInfo = require("./plugin.json");

const TPClient = new TouchPortalAPI.Client();

const ACTION_HANDLERS = {
	"extra-connectors.keyboard-lock-state.action": data => {
		/** @type {"Toggle"|"Enable"|"Disable"} */
		const { value } = data.find(x => x.id === "extra-connectors.keyboard-lock-state.action-value") || {};
		TPClient.logIt("INFO", "Change Keyboard Lock", value);

		// if (pub)
		// 	await pub.send(["ChangeLocked", value]);
	}
};

const STATE_FOR_TOPIC = {
	ChangeKeyboardLockState: {
		id: "extra-connectors.keyboard-lock-state.state",
		default: "false",
		valueProcessor: value => value !== "true" ? "Locked" : "Unlocked"
	},
};

async function init() {
	// create sub socket on port 5555
	const sub = new zeromq.Subscriber();
	await sub.bind("tcp://*:5555");

	// subscribe to all topics in STATE_FOR_TOPIC
	for (const topic of Object.keys(STATE_FOR_TOPIC))
		sub.subscribe(topic);

	// set initial state from default values
	for (const { id, default: defaultValue, valueProcessor } of Object.values(STATE_FOR_TOPIC)) {
		const value = valueProcessor ? valueProcessor(defaultValue) : defaultValue;
		TPClient.stateUpdate(id, value);
	}

	// wait for messages and log them
	for await (const [topicBuf, msgBuf] of sub) {
		// convert topic and msg to string
		const topic = topicBuf.toString();
		const msg = msgBuf.toString();

		// log topic and msg
		TPClient.logIt("INFO", "Message", topic, msg);

		// find state id for topic
		const stateInfo = STATE_FOR_TOPIC[topic];
		if (!stateInfo) {
			TPClient.logIt("WARN", "Unknown Topic", topic);
			continue;
		}

		const finalValue = stateInfo.valueProcessor ? stateInfo.valueProcessor(msg) : msg;

		// update state
		TPClient.stateUpdate(stateInfo.id, finalValue);
	}

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
