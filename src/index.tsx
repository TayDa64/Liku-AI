import React, { useState, useEffect } from 'react';
import { render, useStdin, useApp } from 'ink';
import meow from 'meow';
import GameHub from './ui/LikuTUI.js';

const cli = meow(`
	Usage
	  $ liku

	Description
	  LikuBuddy - Terminal Based ASCII Game Hub

	Options
		--ai  Enable AI interaction mode

	Examples
	  $ liku
	  $ liku --ai
`, {
	importMeta: import.meta,
	flags: {
		ai: {
			type: 'boolean',
		}
	}
});

interface AppProps {
	ai?: boolean;
}

const App: React.FC<AppProps> = ({ ai = false }) => {
	const { exit } = useApp();
	const { stdin, setRawMode } = useStdin();
	const [actionQueue, setActionQueue] = useState<string[]>([]);

	useEffect(() => {
		if (ai) {
			setRawMode(false);
			const handleData = (data: Buffer) => {
				const command = data.toString().trim();
				if (command === 'exit_app') {
					exit();
				}
				setActionQueue(prev => [...prev, ...command.split('\n')]);
			};
			stdin.on('data', handleData);
			return () => {
				stdin.off('data', handleData);
			};
		}
	}, [ai, exit, stdin, setRawMode]);

	return <GameHub ai={ai} actionQueue={actionQueue} setActionQueue={setActionQueue} />;
};

render(<App ai={cli.flags.ai} />);