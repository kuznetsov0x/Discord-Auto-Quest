let discordWebpack = webpackChunkdiscord_app.push([[Symbol()], {}, e => e]);
webpackChunkdiscord_app.pop();

let StreamingStore = Object.values(discordWebpack.c).find(m => m?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata).exports.Z;
let GamesStore = Object.values(discordWebpack.c).find(m => m?.exports?.ZP?.getRunningGames).exports.ZP;
let QuestStore = Object.values(discordWebpack.c).find(m => m?.exports?.Z?.__proto__?.getQuest).exports.Z;
let Channels = Object.values(discordWebpack.c).find(m => m?.exports?.Z?.__proto__?.getAllThreadsForParent).exports.Z;
let GuildChannels = Object.values(discordWebpack.c).find(m => m?.exports?.ZP?.getSFWDefaultChannel).exports.ZP;
let Dispatcher = Object.values(discordWebpack.c).find(m => m?.exports?.Z?.__proto__?.flushWaitQueue).exports.Z;
let request = Object.values(discordWebpack.c).find(m => m?.exports?.tn?.get).exports.tn;

let activeQuest = [...QuestStore.quests.values()].find(q => q.id !== "1412491570820812933" && q.userStatus?.enrolledAt && !q.userStatus?.completedAt && new Date(q.config.expiresAt).getTime() > Date.now())
let desktopClient = typeof DiscordNative !== "undefined"
if(!activeQuest) {
	console.log("No active quests found!")
} else {
	const randomPid = Math.floor(Math.random() * 30000) + 1000
	
	const appId = activeQuest.config.application.id
	const appName = activeQuest.config.application.name
	const questTitle = activeQuest.config.messages.questName
	const tasks = activeQuest.config.taskConfig ?? activeQuest.config.taskConfigV2
	const currentTask = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"].find(t => tasks.tasks[t] != null)
	const requiredTime = tasks.tasks[currentTask].target
	let currentProgress = activeQuest.userStatus?.progress?.[currentTask]?.value ?? 0

	if(currentTask === "WATCH_VIDEO" || currentTask === "WATCH_VIDEO_ON_MOBILE") {
		const futureLimit = 10, rate = 7, delay = 1
		const startTime = new Date(activeQuest.userStatus.enrolledAt).getTime()
		let finished = false
		let updateProgress = async () => {			
			while(true) {
				const maximumAllowed = Math.floor((Date.now() - startTime)/1000) + futureLimit
				const difference = maximumAllowed - currentProgress
				const newTimestamp = currentProgress + rate
				if(difference >= rate) {
					const response = await request.post({url: `/quests/${activeQuest.id}/video-progress`, body: {timestamp: Math.min(requiredTime, newTimestamp + Math.random())}})
					finished = response.body.completed_at != null
					currentProgress = Math.min(requiredTime, newTimestamp)
				}
				
				if(newTimestamp >= requiredTime) {
					break
				}
				await new Promise(r => setTimeout(r, delay * 1000))
			}
			if(!finished) {
				await request.post({url: `/quests/${activeQuest.id}/video-progress`, body: {timestamp: requiredTime}})
			}
			console.log("Quest finished!")
		}
		updateProgress()
		console.log(`Simulating video for ${questTitle}.`)
	} else if(currentTask === "PLAY_ON_DESKTOP") {
		if(!desktopClient) {
			console.log("Browser version doesn't support this quest type. Use Discord desktop for:", questTitle)
		} else {
			request.get({url: `/applications/public?application_ids=${appId}`}).then(response => {
				const appInfo = response.body[0]
				const executable = appInfo.executables.find(e => e.os === "win32").name.replace(">","")
				
				const simulatedGame = {
					cmdLine: `C:\\Program Files\\${appInfo.name}\\${executable}`,
					exeName: executable,
					exePath: `c:/program files/${appInfo.name.toLowerCase()}/${executable}`,
					hidden: false,
					isLauncher: false,
					id: appId,
					name: appInfo.name,
					pid: randomPid,
					pidPath: [randomPid],
					processName: appInfo.name,
					start: Date.now(),
				}
				const actualGames = GamesStore.getRunningGames()
				const fakeGames = [simulatedGame]
				const originalGetGames = GamesStore.getRunningGames
				const originalGetPid = GamesStore.getGameForPID
				GamesStore.getRunningGames = () => fakeGames
				GamesStore.getGameForPID = (pid) => fakeGames.find(g => g.pid === pid)
				Dispatcher.dispatch({type: "RUNNING_GAMES_CHANGE", removed: actualGames, added: [simulatedGame], games: fakeGames})
				
				let progressHandler = data => {
					let progressValue = activeQuest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value)
					console.log(`Progress: ${progressValue}/${requiredTime}`)
					
					if(progressValue >= requiredTime) {
						console.log("Quest finished!")
						
						GamesStore.getRunningGames = originalGetGames
						GamesStore.getGameForPID = originalGetPid
						Dispatcher.dispatch({type: "RUNNING_GAMES_CHANGE", removed: [simulatedGame], added: [], games: []})
						Dispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", progressHandler)
					}
				}
				Dispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", progressHandler)
				
				console.log(`Faked game ${appName}. Wait ${Math.ceil((requiredTime - currentProgress) / 60)} minutes.`)
			})
		}
	} else if(currentTask === "STREAM_ON_DESKTOP") {
		if(!desktopClient) {
			console.log("Browser version doesn't support this quest type. Use Discord desktop for:", questTitle)
		} else {
			let originalStreamFunc = StreamingStore.getStreamerActiveStreamMetadata
			StreamingStore.getStreamerActiveStreamMetadata = () => ({
				id: appId,
				pid: randomPid,
				sourceName: null
			})
			
			let streamHandler = data => {
				let progressValue = activeQuest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value)
				console.log(`Progress: ${progressValue}/${requiredTime}`)
				
				if(progressValue >= requiredTime) {
					console.log("Quest finished!")
					
					StreamingStore.getStreamerActiveStreamMetadata = originalStreamFunc
					Dispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", streamHandler)
				}
			}
			Dispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", streamHandler)
			
			console.log(`Faked stream ${appName}. Stream any window for ${Math.ceil((requiredTime - currentProgress) / 60)} minutes.`)
			console.log("Need at least 1 viewer in voice channel!")
		}
	} else if(currentTask === "PLAY_ACTIVITY") {
		const channelId = Channels.getSortedPrivateChannels()[0]?.id ?? Object.values(GuildChannels.getAllGuilds()).find(g => g != null && g.VOCAL.length > 0).VOCAL[0].channel.id
		const streamId = `call:${channelId}:1`
		
		let activityLoop = async () => {
			console.log("Completing quest", questTitle, "-", activeQuest.config.messages.questName)
			
			while(true) {
				const result = await request.post({url: `/quests/${activeQuest.id}/heartbeat`, body: {stream_key: streamId, terminal: false}})
				const progressValue = result.body.progress.PLAY_ACTIVITY.value
				console.log(`Progress: ${progressValue}/${requiredTime}`)
				
				await new Promise(resolve => setTimeout(resolve, 20 * 1000))
				
				if(progressValue >= requiredTime) {
					await request.post({url: `/quests/${activeQuest.id}/heartbeat`, body: {stream_key: streamId, terminal: true}})
					break
				}
			}
			
			console.log("Quest finished!")
		}
		activityLoop()
	}
}
