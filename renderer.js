// State management
const state = {
    currentTab: 'search',
    searchResults: [],
    installedPackages: [],
    installedPackageNames: new Set(),
    filteredInstalled: [],
    selectedInstall: new Set(),
    selectedUninstall: new Set(),
    packageManager: null,
    searchType: 'all'
  };
  
  // DOM elements
  const searchInput = document.getElementById('search-input');
  const searchBtn = document.getElementById('search-btn');
  const searchTypeSelect = document.getElementById('search-type');
  const searchResults = document.getElementById('search-results');
  const installedList = document.getElementById('installed-list');
  const installedSearchInput = document.getElementById('installed-search-input');
  const installSelectedBtn = document.getElementById('install-selected-btn');
  const uninstallSelectedBtn = document.getElementById('uninstall-selected-btn');
  const clearInstallBtn = document.getElementById('clear-install-btn');
  const unselectUninstallBtn = document.getElementById('unselect-uninstall-btn');
  const selectedInstallCount = document.getElementById('selected-install-count');
  const selectedUninstallCount = document.getElementById('selected-uninstall-count');
  const installQueueList = document.getElementById('install-queue-list');
  const refreshBtn = document.getElementById('refresh-btn');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');
  const passwordInputContainer = document.getElementById('password-input-container');
  const passwordInput = document.getElementById('password-input');
  const loading = document.getElementById('loading');
  
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
  
  function switchTab(tab) {
    state.currentTab = tab;
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tab}-tab`);
    });
  
    if (tab === 'installed' && state.installedPackages.length === 0) {
      loadInstalledPackages();
    }
  }
  
  // Search functionality
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
  
    showLoading();
    state.searchType = searchTypeSelect.value;
    
    const result = await window.electronAPI.searchPackages(query);
    hideLoading();
  
    if (result.success) {
      state.packageManager = result.pm;
      state.searchResults = parseSearchResults(result.data, result.pm);
      
      // Check which packages are installed
      const packageNames = state.searchResults.map(pkg => pkg.name);
      if (packageNames.length > 0) {
        const installedResult = await window.electronAPI.checkInstalled(packageNames);
        if (installedResult.success) {
          state.searchResults.forEach(pkg => {
            pkg.installed = installedResult.installed.includes(pkg.name);
          });
        }
      }
      
      renderSearchResults();
    } else {
      showError('Search failed: ' + result.error);
    }
  }
  
  function parseSearchResults(data, pm) {
    const packages = [];
    const lines = data.split('\n').filter(line => line.trim());
  
    if (pm === 'apt') {
      lines.forEach(line => {
        const match = line.match(/^(\S+)\s+-\s+(.+)$/);
        if (match) {
          packages.push({ name: match[1], description: match[2] });
        }
      });
    } else if (pm === 'dnf') {
      lines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const name = parts[0];
          const desc = parts.slice(1).join(' ');
          packages.push({ name, description: desc });
        }
      });
    } else if (pm === 'pacman') {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('/')) {
          const name = lines[i].split('/')[1].split(' ')[0];
          const description = lines[i + 1] || '';
          packages.push({ name, description });
          i++;
        }
      }
    }
  
    // Filter based on search type
    if (state.searchType !== 'all') {
      const query = searchInput.value.trim().toLowerCase();
      return packages.filter(pkg => {
        if (state.searchType === 'name') {
          return pkg.name.toLowerCase().includes(query);
        } else if (state.searchType === 'description') {
          return pkg.description.toLowerCase().includes(query);
        }
        return true;
      });
    }
  
    return packages;
  }
  
  function renderSearchResults() {
    if (state.searchResults.length === 0) {
      searchResults.innerHTML = '<div class="empty-state"><h3>No packages found</h3><p>Try a different search term</p></div>';
      return;
    }
  
    searchResults.innerHTML = state.searchResults.map((pkg, idx) => `
      <div class="package-item ${pkg.installed ? 'installed' : ''}" data-index="${idx}">
        <input type="checkbox" class="package-checkbox" data-index="${idx}" ${state.selectedInstall.has(pkg.name) ? 'checked' : ''}>
        <div class="package-info">
          <div class="package-name">${escapeHtml(pkg.name)}</div>
          <div class="package-desc">${escapeHtml(pkg.description)}</div>
        </div>
      </div>
    `).join('');
  
    // Add event listeners
    searchResults.querySelectorAll('.package-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const pkg = state.searchResults[idx];
        
        if (e.target.checked) {
          state.selectedInstall.add(pkg.name);
        } else {
          state.selectedInstall.delete(pkg.name);
        }
        
        updateInstallQueue();
      });
    });
  
    searchResults.querySelectorAll('.package-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = item.querySelector('.package-checkbox');
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });
  }
  
  function updateInstallQueue() {
    const packages = Array.from(state.selectedInstall);
    selectedInstallCount.textContent = `${packages.length} package${packages.length !== 1 ? 's' : ''}`;
    installSelectedBtn.disabled = packages.length === 0;
    clearInstallBtn.disabled = packages.length === 0;
  
    if (packages.length === 0) {
      installQueueList.innerHTML = '<div class="empty-state"><p>No packages selected</p></div>';
      return;
    }
  
    installQueueList.innerHTML = packages.map(name => `
      <div class="queue-item">
        <span class="queue-item-name">${escapeHtml(name)}</span>
        <button class="queue-item-remove" data-package="${escapeHtml(name)}">Remove</button>
      </div>
    `).join('');
  
    // Add remove button listeners
    installQueueList.querySelectorAll('.queue-item-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const pkgName = btn.dataset.package;
        state.selectedInstall.delete(pkgName);
        
        // Uncheck in search results
        searchResults.querySelectorAll('.package-checkbox').forEach(cb => {
          const idx = parseInt(cb.dataset.index);
          if (state.searchResults[idx] && state.searchResults[idx].name === pkgName) {
            cb.checked = false;
          }
        });
        
        updateInstallQueue();
      });
    });
  }
  
  // Load installed packages
  async function loadInstalledPackages() {
    showLoading();
    state.selectedUninstall.clear();
    
    const result = await window.electronAPI.listInstalled();
    hideLoading();
  
    if (result.success) {
      state.packageManager = result.pm;
      state.installedPackages = parseInstalledPackages(result.data, result.pm);
      state.installedPackageNames = new Set(state.installedPackages.map(pkg => pkg.name));
      state.filteredInstalled = [...state.installedPackages];
      renderInstalledPackages();
    } else {
      showError('Failed to load installed packages: ' + result.error);
    }
  }
  
  function filterInstalledPackages() {
    const query = installedSearchInput.value.trim().toLowerCase();
    if (!query) {
      state.filteredInstalled = [...state.installedPackages];
    } else {
      state.filteredInstalled = state.installedPackages.filter(pkg => 
        pkg.name.toLowerCase().includes(query) || 
        (pkg.version && pkg.version.toLowerCase().includes(query))
      );
    }
    renderInstalledPackages();
  }
  
  function parseInstalledPackages(data, pm) {
    const packages = [];
    const lines = data.split('\n').filter(line => line.trim());
  
    if (pm === 'apt') {
      lines.forEach(line => {
        if (line.includes('[installed')) {
          const parts = line.split('/');
          if (parts.length > 0) {
            const name = parts[0];
            const versionMatch = line.match(/(\d+[\d\.\-:]+\d+)/);
            const version = versionMatch ? versionMatch[1] : '';
            packages.push({ name, version });
          }
        }
      });
    } else if (pm === 'dnf') {
      lines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2 && !line.startsWith('Installed')) {
          const nameArch = parts[0].split('.');
          const name = nameArch[0];
          const version = parts[1] || '';
          packages.push({ name, version });
        }
      });
    } else if (pm === 'pacman') {
      lines.forEach(line => {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          packages.push({ name: parts[0], version: parts[1] });
        }
      });
    }
  
    return packages;
  }
  
  function renderInstalledPackages() {
    if (state.filteredInstalled.length === 0) {
      installedList.innerHTML = '<div class="empty-state"><h3>No packages found</h3><p>Click Refresh to load packages</p></div>';
      return;
    }
  
    installedList.innerHTML = state.filteredInstalled.map((pkg, idx) => {
      const originalIdx = state.installedPackages.indexOf(pkg);
      return `
      <div class="package-item" data-index="${originalIdx}">
        <input type="checkbox" class="package-checkbox" data-index="${originalIdx}" ${state.selectedUninstall.has(pkg.name) ? 'checked' : ''}>
        <div class="package-info">
          <div class="package-name">${escapeHtml(pkg.name)}</div>
          <div class="package-version">${escapeHtml(pkg.version)}</div>
        </div>
      </div>
    `;
    }).join('');
  
    // Add event listeners
    installedList.querySelectorAll('.package-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const pkg = state.installedPackages[idx];
        
        if (e.target.checked) {
          state.selectedUninstall.add(pkg.name);
        } else {
          state.selectedUninstall.delete(pkg.name);
        }
        
        updateUninstallButton();
      });
    });
  
    installedList.querySelectorAll('.package-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
          const checkbox = item.querySelector('.package-checkbox');
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });
  }
  
  // Install packages
  installSelectedBtn.addEventListener('click', async () => {
    const packages = Array.from(state.selectedInstall);
    if (packages.length === 0) return;
  
    showModal(
      'Install Packages',
      `Enter your password to install the following packages:\n\n${packages.join('\n')}`,
      async () => {
        const password = passwordInput.value.trim();
        if (!password) {
          alert('Password is required');
          passwordInput.focus();
          return;
        }
  
        hideModal();
        showLoading();
        
        const result = await window.electronAPI.installPackages(packages, password);
        hideLoading();
  
        if (result.success) {
          showModal('Installation Complete', result.output || 'Installation completed successfully!', null);
          state.selectedInstall.clear();
          updateInstallQueue();
          renderSearchResults();
        } else {
          showModal('Installation Failed', result.output || result.error, null);
        }
      },
      true
    );
  });
  
  // Uninstall packages
  uninstallSelectedBtn.addEventListener('click', async () => {
    const packages = Array.from(state.selectedUninstall);
    if (packages.length === 0) return;
  
    showLoading();
    const checkResult = await window.electronAPI.checkUninstall(packages);
    hideLoading();
  
    if (checkResult.success) {
      showModal(
        'Uninstall Packages',
        `Enter your password to uninstall. The following will be affected:\n\n${checkResult.output}`,
        async () => {
          const password = passwordInput.value.trim();
          if (!password) {
            alert('Password is required');
            passwordInput.focus();
            return;
          }
  
          hideModal();
          showLoading();
          
          const result = await window.electronAPI.uninstallPackages(packages, password);
          hideLoading();
  
          if (result.success) {
            showModal('Uninstallation Complete', result.output || 'Uninstallation completed successfully!', null);
            await loadInstalledPackages();
          } else {
            showModal('Uninstallation Failed', result.output || result.error, null);
          }
        },
        true
      );
    } else {
      showError('Failed to check uninstall: ' + checkResult.error);
    }
  });
  
  // Refresh button
  refreshBtn.addEventListener('click', loadInstalledPackages);
  
  // Clear install queue button
  clearInstallBtn.addEventListener('click', () => {
    state.selectedInstall.clear();
    searchResults.querySelectorAll('.package-checkbox').forEach(cb => cb.checked = false);
    updateInstallQueue();
  });
  
  // Unselect uninstall button
  unselectUninstallBtn.addEventListener('click', () => {
    state.selectedUninstall.clear();
    installedList.querySelectorAll('.package-checkbox').forEach(cb => cb.checked = false);
    updateUninstallButton();
  });
  
  // Filter installed packages
  installedSearchInput.addEventListener('input', filterInstalledPackages);
  
  // Update button states
  function updateUninstallButton() {
    const count = state.selectedUninstall.size;
    uninstallSelectedBtn.disabled = count === 0;
    unselectUninstallBtn.disabled = count === 0;
    selectedUninstallCount.textContent = `${count} package${count !== 1 ? 's' : ''} selected`;
  }
  
  // Modal functions
  function showModal(title, body, onConfirm, requirePassword = false) {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    passwordInput.value = '';
    
    if (requirePassword) {
      passwordInputContainer.style.display = 'block';
      passwordInput.focus();
    } else {
      passwordInputContainer.style.display = 'none';
    }
    
    modal.classList.add('show');
    
    if (onConfirm) {
      modalConfirm.style.display = 'block';
      modalConfirm.onclick = onConfirm;
    } else {
      modalConfirm.style.display = 'none';
    }
  }
  
  function hideModal() {
    modal.classList.remove('show');
    modalConfirm.style.display = 'block';
    passwordInputContainer.style.display = 'none';
    passwordInput.value = '';
  }
  
  modalCancel.addEventListener('click', hideModal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
  });
  
  // Allow Enter key to submit password
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && modalConfirm.style.display !== 'none') {
      modalConfirm.click();
    }
  });
  
  // Loading and messages
  function showLoading() {
    loading.classList.remove('hidden');
  }
  
  function hideLoading() {
    loading.classList.add('hidden');
  }
  
  function showMessage(msg) {
    alert(msg);
  }
  
  function showError(msg) {
    alert('Error: ' + msg);
  }
  
  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Initialize
  updateInstallQueue();
  updateUninstallButton();