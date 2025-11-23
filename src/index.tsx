import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import LikuTUI from './ui/LikuTUI.js';

const cli = meow(`
	Usage
	  $ liku

	Description
	  LikuBuddy - Terminal Based ASCII Game Hub

	Examples
	  $ liku
`, {
	importMeta: import.meta,
});

// Enter alternate screen buffer handled by fullscreen option
const { waitUntilExit } = render(<LikuTUI />);

waitUntilExit();

