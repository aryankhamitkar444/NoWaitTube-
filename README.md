# NoWaitTube

Lightweight chrome extension for skipping over YouTube ads and restoring the playback speed after one ends, in less time than you'd spend waiting for the 20-second ad to complete.

## How it works

YouTube applies the `ad-showing` class to the video player when an ad is playing. This extension monitors for that class and once detected

- increases the video speed by the set multiplier (default: 16x)

- mute the volume

- click the skip button if it appears

- revert all of the above when the ad finishes playing

The processing is done in the clientside, there is no collection of any data on servers.

## Features

- Auto detect YouTube ads based on HTML classes

- Increase the ad speed up to 16x and mute them

- Automatically click the Skip button

- Revert the changes when the ad ends

- Toggle extension and set the speed multiplier with a right-click popup

## Installing (unpacked / developer mode)

To install the extension, clone/downlad this repo and follow the next steps:

1. Go to chrome://extensions in your Chrome browser

2. Ensure that the Developer mode is enabled (toggle at the top right corner)

3. Click Load unpacked and select the directory that you've cloned/downloaded the repo to

4. Open a YouTube video! The extension should be active and working

## The files

This extension uses the following files:

```

manifest.json  - The extensions manifest (uses Manifest V3)

content.js   - Detection and processing scripts

popup.html   - The right-click popup HTML

popup.js    - The popup scripts

```

## Disclaimer

This project uses undocumented and private APIs of YouTube and is subject to breaking changes. If the extension stops working, it's likely that YouTube has updated their classes and now it can't detect the ads. In that case, report an issue or make a PR with the updated classes. This software is strictly for personal and educational purposes and should not be used for illegal activity. It is not endorsed or supported by YouTube or Google.

## License

MIT - see [LICENSE](LICENSE).
