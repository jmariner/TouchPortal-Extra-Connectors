const path = require("path");
const fs = require("fs/promises");
const { createCanvas, DOMMatrix, Image } = require("canvas");

/**
 * @typedef {Object} BudsBatteryData
 * @property {number} leftBattery
 * @property {number} rightBattery
 * @property {number} leftState
 * @property {number} rightState
 *
 * @typedef {Object} SteelSeriesBatteryState
 * @property {number} batteryLevel
 * @property {number} extraBatteryLevel
 * @property {number} status
 */

/**
 * @typedef {Object} BatteryData
 * @property {BudsBatteryData} buds
 * @property {SteelSeriesBatteryState} headset
 * @property {SteelSeriesBatteryState} mouse
 */

/**
 * @typedef {Object} DeviceState
 * @property {string} text
 * @property {string} color
 */

const COLORS = {
	red: "#ff1212",
	orange: "#ff9f00",
	yellow: "#fff52a",
	green: "#23fd71",
}

/** @type {Record<number, DeviceState} */
const BUDS_BATTERY_STATES = {
	0: {
		// Disconnected
		text: "●",
		color: COLORS.red,
	},
	1: {
		// Wearing
		text: "●",
		color: COLORS.yellow,
	},
	2: {
		// Idle
		text: "●",
		color: COLORS.orange,
	},
	3: {
		// InCase
		text: "●",
		color: COLORS.green,
	},
	4: {
		// InClosedCase
		text: "●",
		color: COLORS.green,
	},
};

/** @type {Record<number, DeviceState} */
const STEELSERIES_BATTERY_STATES = {
	0: {
		// Unknown
		text: "?",
		color: COLORS.red,
	},
	1: {
		// Charging
		text: "●",
		color: COLORS.green,
	},
	2: {
		// Charged
		text: "■",
		color: COLORS.green,
	},
	3: {
		// Discharging
		text: "●",
		color: COLORS.yellow,
	},
	4: {
		// Disconnected
		text: "●",
		color: COLORS.red,
	},
};

const CIRCLE_R = 100;
const PADDING = 5;
const CIRCLE_STROKE = 2;
const CIRCLE_STROKE_BIG = 25;
const IMAGE_SIZE = 100;
const W = CIRCLE_R * 4 + PADDING * 3; // 2 circles + 3 paddings (left, right, between)
const H = CIRCLE_R * 4 + PADDING * 3;

const DEVICE_IMAGES = {
	budsLeft: null,
	budsRight: null,
	headset: null,
	mouse: null,
};

/** @type {BatteryData} */
const currentData = {};

/**
 * @param {Partial<BatteryData>} data
 * @returns {Promise<string>}
 */
async function createImage64(newData, verbose = false) {
	if (Object.values(DEVICE_IMAGES).some(image => image === null)) {
		DEVICE_IMAGES.budsLeft = await loadAssetImage("left-bud.png");
		DEVICE_IMAGES.budsRight = await loadAssetImage("right-bud.png");
		DEVICE_IMAGES.headset = await loadAssetImage("headset.png");
		DEVICE_IMAGES.mouse = await loadAssetImage("mouse.png");
	}

	function logVerbose(...args) {
		if (verbose)
			console.log(...args);
	}

	// update currentData
	Object.assign(currentData, newData);

	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext("2d");
	logVerbose("Drawing data...");
	drawData(ctx, currentData);

	// save image to file test.png for debugging
	logVerbose("Saving image to file...");
	if (verbose)
		await fs.writeFile("test.png", canvas.toBuffer("image/png"));

	// return image as base64 png
	logVerbose("Returning image as base64 png...");
	return canvas.toBuffer("image/png").toString("base64");
}

/**
 * @param {string} name
 * @returns {Promise<Image>}
 */
async function loadAssetImage(name) {
	const filePath = path.resolve(__dirname, "..", "assets", name);
	const buffer = await fs.readFile(filePath);
	const image = new Image();
	await new Promise(resolve => {
		image.onload = () => {
			image.onload = null;
			resolve();
		}
		image.src = buffer;
	});

	return image;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {BatteryData} data
 */
function drawData(ctx, data) {
	ctx.strokeStyle = "#FFFFFF";
	ctx.fillStyle = "#FFFFFF";

	ctx.font = "36px Arial";
	ctx.textBaseline = "middle";
	ctx.textAlign = "center";

	const getDeviceState = (stateID, stateMap) => typeof stateID === "number" ? stateMap[stateID] || null : null;

	// data can be missing properties
	drawBatteryImage(ctx, 0, 0, data.buds?.leftBattery, getDeviceState(data.buds?.leftState, BUDS_BATTERY_STATES), DEVICE_IMAGES.budsLeft);
	drawBatteryImage(ctx, 1, 0, data.buds?.rightBattery, getDeviceState(data.buds?.rightState, BUDS_BATTERY_STATES), DEVICE_IMAGES.budsRight);
	drawBatteryImage(ctx, 0, 1, data.headset?.batteryLevel, getDeviceState(data.headset?.status, STEELSERIES_BATTERY_STATES), DEVICE_IMAGES.headset);
	drawBatteryImage(ctx, 1, 1, data.mouse?.batteryLevel, getDeviceState(data.mouse?.status, STEELSERIES_BATTERY_STATES), DEVICE_IMAGES.mouse);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} gridX
 * @param {number} gridY
 * @param {number} percent
 * @param {DeviceState} state
 * @param {Image} image
 */
function drawBatteryImage(ctx, gridX, gridY, percent, state, image) {
	const x = PADDING * (gridX + 1) + (CIRCLE_R * 2) * gridX;
	const y = PADDING * (gridY + 1) + (CIRCLE_R * 2) * gridY;

	ctx.setTransform(new DOMMatrix().translate(x, y));

	const insetRadius = CIRCLE_R - CIRCLE_STROKE / 2;

	// draw thin outer line
	ctx.lineWidth = CIRCLE_STROKE;
	ctx.beginPath();
	ctx.arc(CIRCLE_R, CIRCLE_R, insetRadius, 0, Math.PI * 2);
	ctx.stroke();

	// draw thin inner line
	ctx.beginPath();
	ctx.arc(CIRCLE_R, CIRCLE_R, insetRadius - CIRCLE_STROKE_BIG, 0, Math.PI * 2);
	ctx.stroke();

	// draw image
	if (image) {
		const pos = CIRCLE_R - IMAGE_SIZE / 2;
		ctx.drawImage(image, pos, pos, IMAGE_SIZE, IMAGE_SIZE);
	}

	// draw thick outer line according to percent
	const actualPercent = Math.min(100, Math.max(0, percent || 0)) / 100;
	ctx.lineWidth = CIRCLE_STROKE_BIG;
	ctx.beginPath();
	ctx.arc(CIRCLE_R, CIRCLE_R, insetRadius - ctx.lineWidth / 2, -0.5 * Math.PI, -0.5 * Math.PI + Math.PI * 2 * actualPercent);
	ctx.stroke();

	// draw state text
	if (state) {
		const pos = CIRCLE_R - IMAGE_SIZE / 2 + 15;
		ctx.fillStyle = state.color;
		ctx.fillText(state.text, pos, pos);
	}
}

module.exports.createImage64 = createImage64;
