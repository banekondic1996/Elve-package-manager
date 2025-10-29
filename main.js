const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Detect package manager
async function detectPackageManager() {
  const managers = [
    { name: 'apt', checkCmd: 'which apt-get' },
    { name: 'dnf', checkCmd: 'which dnf' },
    { name: 'pacman', checkCmd: 'which pacman' }
  ];

  for (const manager of managers) {
    try {
      await execPromise(manager.checkCmd);
      return manager.name;
    } catch (e) {
      continue;
    }
  }
  return null;
}

// Search packages
ipcMain.handle('search-packages', async (event, query) => {
  try {
    const pm = await detectPackageManager();
    if (!pm) throw new Error('No supported package manager found');

    let cmd;
    switch (pm) {
      case 'apt':
        cmd = `apt-cache search ${query} | head -100`;
        break;
      case 'dnf':
        cmd = `dnf search ${query} 2>&1 | grep -E "^[a-zA-Z0-9]" | head -100`;
        break;
      case 'pacman':
        cmd = `pacman -Ss ${query} | head -200`;
        break;
    }

    const { stdout } = await execPromise(cmd);
    return { success: true, data: stdout, pm };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// List installed packages
ipcMain.handle('list-installed', async () => {
  try {
    const pm = await detectPackageManager();
    if (!pm) throw new Error('No supported package manager found');

    let cmd;
    switch (pm) {
      case 'apt':
        cmd = 'apt list --installed 2>/dev/null';
        break;
      case 'dnf':
        cmd = 'dnf list installed 2>&1 | tail -n +2';
        break;
      case 'pacman':
        cmd = 'pacman -Q';
        break;
    }

    const { stdout } = await execPromise(cmd);
    return { success: true, data: stdout, pm };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Install packages
ipcMain.handle('install-packages', async (event, packages, password) => {
  try {
    const pm = await detectPackageManager();
    if (!pm) throw new Error('No supported package manager found');

    if (!password || typeof password !== 'string') {
      throw new Error('Invalid password provided');
    }

    const pkgList = packages.join(' ');
    const escapedPassword = password.replace(/'/g, "'\\''");
    let cmd;
    
    switch (pm) {
      case 'apt':
        cmd = `echo '${escapedPassword}' | sudo -S apt-get install -y ${pkgList}`;
        break;
      case 'dnf':
        cmd = `echo '${escapedPassword}' | sudo -S dnf install -y ${pkgList}`;
        break;
      case 'pacman':
        cmd = `echo '${escapedPassword}' | sudo -S pacman -S --noconfirm ${pkgList}`;
        break;
    }

    const { stdout, stderr } = await execPromise(cmd, { 
      maxBuffer: 1024 * 1024 * 10,
      shell: '/bin/bash'
    });
    return { success: true, output: stdout + stderr };
  } catch (error) {
    return { success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') };
  }
});

// Check if packages are installed
ipcMain.handle('check-installed', async (event, packages) => {
  try {
    const pm = await detectPackageManager();
    if (!pm) throw new Error('No supported package manager found');

    const installedSet = new Set();
    
    for (const pkg of packages) {
      let cmd;
      switch (pm) {
        case 'apt':
          cmd = `dpkg -l ${pkg} 2>/dev/null | grep ^ii`;
          break;
        case 'dnf':
          cmd = `dnf list installed ${pkg} 2>/dev/null`;
          break;
        case 'pacman':
          cmd = `pacman -Q ${pkg} 2>/dev/null`;
          break;
      }
      
      try {
        await execPromise(cmd);
        installedSet.add(pkg);
      } catch (e) {
        // Package not installed
      }
    }
    
    return { success: true, installed: Array.from(installedSet) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Check what will be uninstalled
ipcMain.handle('check-uninstall', async (event, packages) => {
  try {
    const pm = await detectPackageManager();
    if (!pm) throw new Error('No supported package manager found');

    const pkgList = packages.join(' ');
    let cmd;
    switch (pm) {
      case 'apt':
        cmd = `apt-get --simulate remove ${pkgList} 2>&1`;
        break;
      case 'dnf':
        cmd = `dnf remove --assumeno ${pkgList} 2>&1`;
        break;
      case 'pacman':
        cmd = `pacman -R --print ${pkgList} 2>&1`;
        break;
    }

    const { stdout, stderr } = await execPromise(cmd, { encoding: 'utf8' }).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || '' }));
    return { success: true, output: stdout + stderr };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Uninstall packages
ipcMain.handle('uninstall-packages', async (event, packages, password) => {
  try {
    const pm = await detectPackageManager();
    if (!pm) throw new Error('No supported package manager found');

    if (!password || typeof password !== 'string') {
      throw new Error('Invalid password provided');
    }

    const pkgList = packages.join(' ');
    const escapedPassword = password.replace(/'/g, "'\\''");
    let cmd;
    
    switch (pm) {
      case 'apt':
        cmd = `echo '${escapedPassword}' | sudo -S apt-get remove -y ${pkgList}`;
        break;
      case 'dnf':
        cmd = `echo '${escapedPassword}' | sudo -S dnf remove -y ${pkgList}`;
        break;
      case 'pacman':
        cmd = `echo '${escapedPassword}' | sudo -S pacman -R --noconfirm ${pkgList}`;
        break;
    }

    const { stdout, stderr } = await execPromise(cmd, { 
      maxBuffer: 1024 * 1024 * 10,
      shell: '/bin/bash'
    });
    return { success: true, output: stdout + stderr };
  } catch (error) {
    return { success: false, error: error.message, output: (error.stdout || '') + (error.stderr || '') };
  }
});