import { writeTextFile, readTextFile, BaseDirectory, createDir, exists } from '@tauri-apps/api/fs';
import { appDataDir } from '@tauri-apps/api/path';

const STORAGE_FILE = 'media_state.json';

export async function saveAppPersistenceState(state: any) {
  try {
    const appDataDirPath = await appDataDir();
    if (!(await exists(appDataDirPath))) {
      await createDir(appDataDirPath, { recursive: true });
    }
    await writeTextFile(STORAGE_FILE, JSON.stringify(state), { dir: BaseDirectory.AppData });
    console.log('State persisted successfully.');
  } catch (error) {
    console.error('Failed to persist state:', error);
    throw error;
  }
}

export async function loadAppPersistenceState() {
  try {
    const content = await readTextFile(STORAGE_FILE, { dir: BaseDirectory.AppData });
    return JSON.parse(content);
  } catch (error) {
    console.warn('No persistent state found, returning null.');
    return null;
  }
}
