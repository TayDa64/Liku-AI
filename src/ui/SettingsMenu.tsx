import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { db, UserSettings } from '../services/DatabaseService.js';

interface SettingsMenuProps {
    onExit: () => void;
    onSettingsChanged: () => void;
}

const SettingsMenu: React.FC<SettingsMenuProps> = ({ onExit, onSettingsChanged }) => {
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [selectedItem, setSelectedItem] = useState(0);

    useEffect(() => {
        db.getSettings().then(setSettings).catch(console.error);
    }, []);

    const menuItems = [
        { 
            id: 'theme', 
            label: 'Theme', 
            value: settings?.theme, 
            options: ['default', 'matrix', 'cyberpunk', 'retro'] 
        },
        { 
            id: 'difficulty', 
            label: 'Snake Difficulty', 
            value: settings?.snakeDifficulty, 
            options: ['easy', 'medium', 'hard'] 
        },
        { id: 'back', label: 'Back to Main Menu' }
    ];

    const handleToggle = async (direction: 1 | -1) => {
        if (!settings) return;
        const item = menuItems[selectedItem];
        
        if (item.id === 'theme') {
            const options = item.options!;
            const currentIndex = options.indexOf(settings.theme);
            const nextIndex = (currentIndex + direction + options.length) % options.length;
            const newTheme = options[nextIndex] as UserSettings['theme'];
            
            await db.updateSettings({ theme: newTheme });
            setSettings({ ...settings, theme: newTheme });
            onSettingsChanged();
        } else if (item.id === 'difficulty') {
            const options = item.options!;
            const currentIndex = options.indexOf(settings.snakeDifficulty);
            const nextIndex = (currentIndex + direction + options.length) % options.length;
            const newDifficulty = options[nextIndex] as UserSettings['snakeDifficulty'];
            
            await db.updateSettings({ snakeDifficulty: newDifficulty });
            setSettings({ ...settings, snakeDifficulty: newDifficulty });
            onSettingsChanged();
        }
    };

    useInput((input, key) => {
        if (!settings) return;

        if (key.upArrow) {
            setSelectedItem(prev => Math.max(0, prev - 1));
        }
        if (key.downArrow) {
            setSelectedItem(prev => Math.min(menuItems.length - 1, prev + 1));
        }
        if (key.leftArrow) {
            handleToggle(-1);
        }
        if (key.rightArrow) {
            handleToggle(1);
        }
        if (key.return) {
            if (menuItems[selectedItem].id === 'back') {
                onExit();
            } else {
                // Also toggle on enter for convenience
                handleToggle(1);
            }
        }
        if (key.escape) {
            onExit();
        }
    });

    if (!settings) return <Text>Loading settings...</Text>;

    return (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
            <Box marginBottom={1}>
                <Text bold color="yellow">⚙️ Settings ⚙️</Text>
            </Box>
            
            <Box flexDirection="column">
                {menuItems.map((item, index) => (
                    <Box key={item.id} flexDirection="row" justifyContent="space-between" width={40}>
                        <Text color={index === selectedItem ? 'green' : 'white'}>
                            {index === selectedItem ? '> ' : '  '}
                            {item.label}
                        </Text>
                        {item.value && (
                            <Text color="cyan">
                                ◄ {item.value.toUpperCase()} ►
                            </Text>
                        )}
                    </Box>
                ))}
            </Box>

            <Box marginTop={1}>
                <Text dimColor>Use ↑/↓ to select, ←/→ to change, Enter/Esc to back</Text>
            </Box>
        </Box>
    );
};

export default SettingsMenu;
