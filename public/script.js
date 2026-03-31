let selectedFiles = [];
let uploadCancelled = false;
let activeXHRRequests = []; // Track active upload requests

// Pagination state
let currentPage = 1;
let filesPerPage = 6; // files per page for pagination
let allFiles = []; // Store all fetched files

// Selection state for bulk operations
let selectedFilePaths = new Set();

// Sort state
let currentSort = 'date-desc';

// Debounce timer for file reload
let reloadDebounceTimer = null;
const RELOAD_DEBOUNCE_MS = 500;

// Unique client ID for upload activity tracking
const clientId = 'client_' + Math.random().toString(36).substr(2, 9);

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const filesInput = document.getElementById('filesInput');
const selectedFilesDiv = document.getElementById('selectedFiles');
const filesListDiv = document.getElementById('filesList');
const uploadBtn = document.getElementById('uploadBtn');
const cancelBtn = document.getElementById('cancelBtn');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const progressStats = document.getElementById('progressStats');
const searchInput = document.getElementById('searchInput');
const fileCount = document.getElementById('fileCount');
const extensionFilter = document.getElementById('extensionFilter');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const currentPageSpan = document.getElementById('currentPage');
const totalPagesSpan = document.getElementById('totalPages');
const sortOption = document.getElementById('sortOption');
const bulkActions = document.getElementById('bulkActions');
const selectedCountSpan = document.getElementById('selectedCount');
const selectAllBtn = document.getElementById('selectAllBtn');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const themeToggle = document.getElementById('themeToggle');
const uploadActivity = document.getElementById('uploadActivity');
const activityList = document.getElementById('activityList');
const previewModal = document.getElementById('previewModal');
const previewContainer = document.getElementById('previewContainer');

// Drag and drop handlers
uploadArea.addEventListener('dragover', (e) => {
	e.preventDefault();
	uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
	uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
	e.preventDefault();
	uploadArea.classList.remove('dragover');

	const items = e.dataTransfer.items;
	handleDroppedItems(items);
});

// Handle dropped items (files and folders)
async function handleDroppedItems(items) {
	selectedFiles = [];

	for (let i = 0; i < items.length; i++) {
		const item = items[i].webkitGetAsEntry();
		if (item) {
			await traverseFileTree(item);
		}
	}

	displaySelectedFiles();
}

// Recursively traverse file tree
async function traverseFileTree(item, path = '') {
	return new Promise((resolve) => {
		if (item.isFile) {
			item.file((file) => {
				// Store the full path in a property that we can access later
				Object.defineProperty(file, 'relativePath', {
					value: path + file.name,
					writable: false,
					enumerable: true,
				});
				selectedFiles.push(file);
				console.log('Added file from drag-drop:', file.relativePath); // Debug
				resolve();
			});
		} else if (item.isDirectory) {
			const dirReader = item.createReader();
			dirReader.readEntries(async (entries) => {
				for (let i = 0; i < entries.length; i++) {
					await traverseFileTree(entries[i], path + item.name + '/');
				}
				resolve();
			});
		}
	});
}

// Handle file input change (folder selection)
fileInput.addEventListener('change', (e) => {
	selectedFiles = Array.from(e.target.files);
	// Mark files as coming from folder selection
	selectedFiles.forEach((f) => {
		Object.defineProperty(f, 'isFromFolder', { value: true, writable: false });
	});
	console.log('Folder selected, files:', selectedFiles.length);
	selectedFiles.forEach((f, i) => {
		if (i < 5) console.log('File', i, ':', f.name, 'webkitRelativePath:', f.webkitRelativePath);
	});
	displaySelectedFiles();
});

// Handle files input change (multiple files)
filesInput.addEventListener('change', (e) => {
	selectedFiles = Array.from(e.target.files);
	// Mark files as coming from file selection (no folder structure)
	selectedFiles.forEach((f) => {
		Object.defineProperty(f, 'isFromFolder', { value: false, writable: false });
	});
	console.log('Files selected (no folder):', selectedFiles.length);
	selectedFiles.forEach((f, i) => {
		if (i < 5) console.log('File', i, ':', f.name);
	});
	displaySelectedFiles();
});

// Display selected files
function displaySelectedFiles() {
	if (selectedFiles.length === 0) {
		selectedFilesDiv.classList.add('hidden');
		return;
	}

	filesListDiv.innerHTML = '';
	selectedFiles.forEach((file, index) => {
		const fileItem = document.createElement('div');
		fileItem.className = 'file-item';

		const fileName = file.webkitRelativePath || file.relativePath || file.name;
		const fileSize = formatFileSize(file.size);

		fileItem.innerHTML = `
            <span>${fileName}</span>
            <span class="file-size">${fileSize}</span>
        `;

		filesListDiv.appendChild(fileItem);
	});

	selectedFilesDiv.classList.remove('hidden');
}

// Upload files
uploadBtn.addEventListener('click', async () => {
	if (selectedFiles.length === 0) {
		showNotification('Please select files to upload', 'error');
		return;
	}

	uploadCancelled = false;
	uploadProgress.classList.remove('hidden');
	uploadBtn.disabled = true;

	let uploadedCount = 0;
	let failedCount = 0;
	let corruptedCount = 0;
	const totalFiles = selectedFiles.length;
	let totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
	let uploadedSize = 0;
	const startTime = Date.now();

	const CONCURRENT_UPLOADS = 5; // Number of simultaneous uploads
	const MAX_RETRIES = 3; // Maximum retry attempts
	let currentIndex = 0;
	let activeUploads = 0;

	// Function to upload a single file with retry logic
	async function uploadFile(file, retryCount = 0) {
		// For folder selection: use webkitRelativePath or relativePath
		// For file selection: use just the filename
		let fileName;
		if (file.isFromFolder) {
			fileName = file.webkitRelativePath || file.relativePath || file.name;
		} else {
			fileName = file.name; // Just filename, no path
		}

		const fileNumber = currentIndex + 1;
		const retryText = retryCount > 0 ? ` (Retry ${retryCount}/${MAX_RETRIES})` : '';

		console.log('Upload function - file object:', {
			name: file.name,
			isFromFolder: file.isFromFolder,
			webkitRelativePath: file.webkitRelativePath,
			relativePath: file.relativePath,
			finalFileName: fileName,
			retryAttempt: retryCount,
		});

		try {
			// Update progress bar based on file count
			const percent = Math.round((currentIndex / totalFiles) * 100);
			progressFill.style.width = percent + '%';
			progressText.textContent = `Uploading ${fileNumber}/${totalFiles}: ${fileName.length > 50 ? '...' + fileName.slice(-50) : fileName}${retryText}`;

			// Update stats
			const elapsed = (Date.now() - startTime) / 1000;
			if (elapsed > 0 && uploadedSize > 0) {
				const speed = uploadedSize / elapsed;
				const remaining = (totalSize - uploadedSize) / speed;
				const speedText = formatFileSize(speed) + '/s';
				const remainingText = isFinite(remaining) && remaining > 0 ? formatTime(remaining) : 'calculating...';
				progressStats.textContent = `Speed: ${speedText} | Remaining: ${remainingText} | Active: ${activeUploads}/${CONCURRENT_UPLOADS}`;
			} else {
				progressStats.textContent = `Uploading... | Active: ${activeUploads}/${CONCURRENT_UPLOADS}`;
			}

			// Calculate file hash for integrity check
			const hashResult = await calculateFileHash(file);

			if (uploadCancelled) return { cancelled: true };

			// Upload file
			const formData = new FormData();

			// Preserve the relative path - use forward slashes
			const fileNameForUpload = fileName.replace(/\\/g, '/'); // Ensure forward slashes
			console.log('FormData - Original file.name:', file.name);
			console.log('FormData - fileName to send:', fileNameForUpload);
			console.log('FormData - isFromFolder:', file.isFromFolder);
			console.log('FormData - webkitRelativePath:', file.webkitRelativePath);

			// Extract folder path (everything except the filename)
			const lastSlashIndex = fileNameForUpload.lastIndexOf('/');
			const folderPath = lastSlashIndex >= 0 ? fileNameForUpload.substring(0, lastSlashIndex) : '';
			const justFileName = lastSlashIndex >= 0 ? fileNameForUpload.substring(lastSlashIndex + 1) : fileNameForUpload;

			console.log('Extracted folderPath:', folderPath);
			console.log('Extracted justFileName:', justFileName);

			// Send folder path as separate field and use it in multer destination
			formData.append('folderPath', folderPath);
			formData.append('files', file, justFileName);

			console.log('Uploading file with name:', justFileName, 'to folder:', folderPath); // Debug log

			// Only send hash if using secure method
			if (hashResult.isSecure) {
				formData.append('hashes', JSON.stringify([hashResult.hash]));
			} else {
				formData.append('hashes', JSON.stringify([]));
			}

			// Use XMLHttpRequest for progress tracking
			const xhr = new XMLHttpRequest();

			// Track this request
			activeXHRRequests.push(xhr);

			let lastLoaded = 0; // Track bytes uploaded for progress display

			return new Promise((resolve, reject) => {
				// Track upload progress
				xhr.upload.addEventListener('progress', (e) => {
					if (e.lengthComputable) {
						// Calculate current file progress
						const fileProgress = e.loaded;
						lastLoaded = e.loaded;
						const currentUploadedSize = uploadedSize + fileProgress;

						// Update progress bar
						const percent = Math.round((currentUploadedSize / totalSize) * 100);
						progressFill.style.width = percent + '%';

						// Update stats in real-time with MB tracking
						const elapsed = (Date.now() - startTime) / 1000;
						if (elapsed > 0) {
							const speed = currentUploadedSize / elapsed;
							const remaining = (totalSize - currentUploadedSize) / speed;
							const speedText = formatFileSize(speed) + '/s';
							const remainingText = isFinite(remaining) && remaining > 0 ? formatTime(remaining) : 'finishing...';
							const uploadedMB = formatFileSize(fileProgress);
							const totalMB = formatFileSize(file.size);
							progressStats.textContent = `Speed: ${speedText} | Uploaded: ${uploadedMB}/${totalMB} | Remaining: ${remainingText} | Active: ${activeUploads}/${CONCURRENT_UPLOADS}`;
						}
					}
				});

				xhr.addEventListener('load', () => {
					// Remove from active requests
					const index = activeXHRRequests.indexOf(xhr);
					if (index > -1) activeXHRRequests.splice(index, 1);

					if (xhr.status >= 200 && xhr.status < 300) {
						try {
							const result = JSON.parse(xhr.responseText);

							if (result.results && result.results.length > 0) {
								const fileResult = result.results[0];

								if (fileResult.success) {
									uploadedCount++;
									uploadedSize += file.size;
									console.log(`✓ Uploaded: ${fileResult.filename}`);
									resolve({ success: true });
								} else if (fileResult.corrupted) {
									corruptedCount++;
									uploadedSize += file.size;
									console.error(`✗ Corrupted: ${fileResult.filename}`);
									resolve({ corrupted: true });
								} else {
									failedCount++;
									uploadedSize += file.size;
									console.error(`✗ Failed: ${fileResult.filename} - ${fileResult.error}`);
									resolve({ failed: true });
								}
							} else {
								failedCount++;
								uploadedSize += file.size;
								console.error(`✗ Upload failed for ${fileName}`);
								resolve({ failed: true });
							}
						} catch (error) {
							failedCount++;
							uploadedSize += file.size;
							console.error(`✗ Error parsing response:`, error);
							resolve({ error: true });
						}
					} else {
						failedCount++;
						uploadedSize += file.size;
						console.error(`✗ Upload failed with status ${xhr.status}`);

						// Retry logic for server errors (5xx)
						if (xhr.status >= 500 && retryCount < MAX_RETRIES && !uploadCancelled) {
							console.warn(`⚠ Server error (${xhr.status}), retrying... (${retryCount + 1}/${MAX_RETRIES})`);
							setTimeout(() => {
								resolve(uploadFile(file, retryCount + 1));
							}, 3000 * (retryCount + 1)); // Longer backoff for server errors
						} else {
							resolve({ failed: true });
						}
					}
				});

				xhr.addEventListener('error', () => {
					// Remove from active requests
					const index = activeXHRRequests.indexOf(xhr);
					if (index > -1) activeXHRRequests.splice(index, 1);

					// Retry logic for network errors
					if (retryCount < MAX_RETRIES && !uploadCancelled) {
						console.warn(`⚠ Network error uploading ${fileName}, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
						setTimeout(() => {
							resolve(uploadFile(file, retryCount + 1));
						}, 2000 * (retryCount + 1)); // Exponential backoff: 2s, 4s, 6s
					} else {
						failedCount++;
						uploadedSize += file.size;
						console.error(`✗ Network error uploading ${fileName} after ${retryCount} retries`);
						resolve({ error: true });
					}
				});

				xhr.addEventListener('abort', () => {
					// Remove from active requests
					const index = activeXHRRequests.indexOf(xhr);
					if (index > -1) activeXHRRequests.splice(index, 1);

					console.log(`Upload cancelled: ${fileName}`);
					resolve({ cancelled: true });
				});

				xhr.addEventListener('timeout', () => {
					// Remove from active requests
					const index = activeXHRRequests.indexOf(xhr);
					if (index > -1) activeXHRRequests.splice(index, 1);

					// Retry logic for timeout
					if (retryCount < MAX_RETRIES && !uploadCancelled) {
						console.warn(`⚠ Upload timeout for ${fileName}, retrying... (${retryCount + 1}/${MAX_RETRIES})`);
						setTimeout(() => {
							resolve(uploadFile(file, retryCount + 1));
						}, 2000 * (retryCount + 1)); // Exponential backoff
					} else {
						failedCount++;
						uploadedSize += file.size;
						console.error(`✗ Upload timeout for ${fileName} after ${retryCount} retries`);
						resolve({ timeout: true });
					}
				});

				xhr.open('POST', '/upload-chunk');
				xhr.timeout = 0; // No timeout limit
				xhr.send(formData);
			});
		} catch (error) {
			failedCount++;
			uploadedSize += file.size;
			console.error(`✗ Error uploading ${fileName}:`, error);
			return { error: true };
		}
	}

	// Function to process next file
	let uploadFinished = false;
	async function processNext() {
		if (uploadCancelled || currentIndex >= totalFiles) {
			return;
		}

		const fileIndex = currentIndex++;
		const file = selectedFiles[fileIndex];

		activeUploads++;
		const result = await uploadFile(file);
		activeUploads--;

		// Start next upload if there are more files
		if (currentIndex < totalFiles && !uploadCancelled) {
			processNext();
		}

		// Check if all uploads are complete
		if (activeUploads === 0 && currentIndex >= totalFiles && !uploadFinished) {
			uploadFinished = true;
			finishUpload();
		}
	}

	// Function to finish upload
	function finishUpload() {
		if (!uploadCancelled) {
			progressFill.style.width = '100%';

			let message = `Upload complete! ${uploadedCount} file(s) uploaded`;
			if (failedCount > 0) message += `, ${failedCount} failed`;
			if (corruptedCount > 0) message += `, ${corruptedCount} corrupted`;

			progressText.textContent = message;
			progressStats.textContent = `Total: ${formatFileSize(totalSize)} in ${formatTime((Date.now() - startTime) / 1000)}`;

			if (corruptedCount > 0) {
				showNotification(`Warning: ${corruptedCount} file(s) were corrupted during upload`, 'error');
			} else if (failedCount > 0) {
				showNotification(message, 'error');
			} else {
				showNotification(message, 'success');
			}
		}

		setTimeout(() => {
			uploadProgress.classList.add('hidden');
			selectedFilesDiv.classList.add('hidden');
			progressFill.style.width = '0%';
			progressStats.textContent = '';
			selectedFiles = [];
			fileInput.value = '';
			filesInput.value = '';
			uploadBtn.disabled = false;
			uploadCancelled = false;
			activeXHRRequests = []; // Clear any remaining requests
			loadFiles();
			loadDiskSpace();
		}, 3000);
	}

	// Start concurrent uploads
	try {
		for (let i = 0; i < Math.min(CONCURRENT_UPLOADS, totalFiles); i++) {
			processNext();
		}
	} catch (error) {
		console.error('Upload error:', error);
		showNotification('Upload failed: ' + error.message, 'error');
		uploadProgress.classList.add('hidden');
		progressFill.style.width = '0%';
		progressStats.textContent = '';
		uploadBtn.disabled = false;
		uploadCancelled = false;
	}
});

// Cancel upload
cancelBtn.addEventListener('click', () => {
	uploadCancelled = true;
	cancelBtn.disabled = true;
	progressText.textContent = 'Cancelling upload...';

	// Abort all active XHR requests
	console.log(`Aborting ${activeXHRRequests.length} active uploads...`);
	activeXHRRequests.forEach((xhr) => {
		try {
			xhr.abort();
		} catch (e) {
			console.error('Error aborting request:', e);
		}
	});
	activeXHRRequests = []; // Clear the array
});

// Calculate file hash using Web Crypto API with fallback
async function calculateFileHash(file) {
	try {
		// Check if Web Crypto API is available (requires HTTPS or localhost)
		if (window.crypto && window.crypto.subtle) {
			const hashBuffer = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
			const hash = Array.from(new Uint8Array(hashBuffer))
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
			return { hash, isSecure: true };
		} else {
			// Fallback: No hash verification on HTTP connections
			console.warn('Crypto API not available - hash verification disabled');
			return { hash: '', isSecure: false };
		}
	} catch (error) {
		console.warn('Hash calculation failed, disabling verification:', error);
		return { hash: '', isSecure: false };
	}
}

// Simple fallback hash function (kept for reference only, not used)
function simpleHash(file) {
	// Create a hash from file metadata
	const str = `${file.name}-${file.size}-${file.lastModified}-${file.type}`;
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(16).padStart(16, '0');
}

// Format time in seconds to readable format
function formatTime(seconds) {
	if (!isFinite(seconds) || seconds < 0) return 'calculating...';
	if (seconds < 60) return Math.round(seconds) + 's';
	if (seconds < 3600) return Math.round(seconds / 60) + 'm ' + Math.round(seconds % 60) + 's';
	return Math.round(seconds / 3600) + 'h ' + Math.round((seconds % 3600) / 60) + 'm';
}

// Load shared files with folder structure
async function loadFiles() {
	try {
		const response = await fetch('/files-list');
		const data = await response.json();

		const filesGrid = document.getElementById('filesList-shared');
		allFiles = data.files; // Store for search and pagination

		// Apply sorting
		sortFiles(allFiles);

		// Update file count
		updateFileCount(allFiles.length);

		// Populate extension filter
		populateExtensionFilter(allFiles);

		// Reset to page 1
		currentPage = 1;

		// Clear selection
		selectedFilePaths.clear();
		updateBulkActionsBar();

		if (data.files.length === 0) {
			filesGrid.innerHTML = '<p class="no-files">No files uploaded yet</p>';
			updatePaginationControls(0);
			return;
		}

		// Render files with pagination
		renderFilesPage();
	} catch (error) {
		console.error('Error loading files:', error);
		showNotification('Failed to load files', 'error');
	}
}

// Debounced file reload to prevent rapid reloads
function debouncedLoadFiles() {
	if (reloadDebounceTimer) {
		clearTimeout(reloadDebounceTimer);
	}
	reloadDebounceTimer = setTimeout(() => {
		loadFiles();
		reloadDebounceTimer = null;
	}, RELOAD_DEBOUNCE_MS);
}

// Sort files based on current sort option
function sortFiles(files) {
	switch (currentSort) {
		case 'name-asc':
			files.sort((a, b) => a.name.localeCompare(b.name));
			break;
		case 'name-desc':
			files.sort((a, b) => b.name.localeCompare(a.name));
			break;
		case 'date-desc':
			files.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
			break;
		case 'date-asc':
			files.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
			break;
		case 'size-desc':
			files.sort((a, b) => b.size - a.size);
			break;
		case 'size-asc':
			files.sort((a, b) => a.size - b.size);
			break;
	}
	return files;
}

// Populate extension filter with available file types
function populateExtensionFilter(files) {
	if (!extensionFilter) return;

	// Get unique extensions
	const extensions = new Set();
	files.forEach((file) => {
		const ext = file.name.split('.').pop().toLowerCase();
		if (ext) extensions.add(ext);
	});

	// Sort extensions alphabetically
	const sortedExtensions = Array.from(extensions).sort();

	// Clear and repopulate filter
	extensionFilter.innerHTML = '<option value="">All Types</option>';
	sortedExtensions.forEach((ext) => {
		const option = document.createElement('option');
		option.value = ext;
		option.textContent = `.${ext.toUpperCase()}`;
		extensionFilter.appendChild(option);
	});
}

// Update file count display
function updateFileCount(count) {
	if (fileCount) {
		fileCount.textContent = `${count} file${count !== 1 ? 's' : ''}`;
	}
}

// Search and filter files
function searchFiles(query) {
	const selectedExtension = extensionFilter ? extensionFilter.value : '';
	currentPage = 1; // Reset to page 1 on search
	filterFiles(query, selectedExtension);
}

// Filter files by extension
function filterByExtension(extension) {
	const searchQuery = searchInput ? searchInput.value : '';
	currentPage = 1; // Reset to page 1 on filter
	filterFiles(searchQuery, extension);
}

// Combined filter function
function filterFiles(searchQuery = '', extension = '') {
	const filesGrid = document.getElementById('filesList-shared');

	if (!searchQuery && !extension) {
		// Show all files with pagination
		renderFilesPage();
		return;
	}

	// Filter files
	let filteredFiles = allFiles;

	// Filter by extension
	if (extension) {
		filteredFiles = filteredFiles.filter((file) => {
			const fileExt = file.name.split('.').pop().toLowerCase();
			return fileExt === extension.toLowerCase();
		});
	}

	// Filter by search query
	if (searchQuery && searchQuery.trim() !== '') {
		const searchLower = searchQuery.toLowerCase();
		filteredFiles = filteredFiles.filter((file) => {
			const fileName = file.name.toLowerCase();
			const filePath = file.path.toLowerCase();
			return fileName.includes(searchLower) || filePath.includes(searchLower);
		});
	}

	updateFileCount(filteredFiles.length);

	if (filteredFiles.length === 0) {
		let message = 'No files found';
		if (searchQuery && extension) {
			message += ` matching "${searchQuery}" with extension .${extension.toUpperCase()}`;
		} else if (searchQuery) {
			message += ` matching "${searchQuery}"`;
		} else if (extension) {
			message += ` with extension .${extension.toUpperCase()}`;
		}
		filesGrid.innerHTML = `<p class="no-files">${message}</p>`;
		updatePaginationControls(0);
		return;
	}

	// Build and render structure with filtered files (with pagination)
	renderFilesPage(filteredFiles);
}

// Build folder structure from flat file list
function buildFolderStructure(files) {
	const root = { folders: {}, files: [] };

	files.forEach((file) => {
		const pathParts = file.path.split('/').filter((p) => p);
		let current = root;

		// Navigate/create folder structure
		for (let i = 0; i < pathParts.length - 1; i++) {
			const folderName = pathParts[i];
			if (!current.folders[folderName]) {
				current.folders[folderName] = { folders: {}, files: [] };
			}
			current = current.folders[folderName];
		}

		// Add file to current folder
		current.files.push(file);
	});

	return root;
}

// Render folder structure recursively
function renderFolderStructure(structure, container, currentPath) {
	// Render folders first
	const folderNames = Object.keys(structure.folders).sort();
	folderNames.forEach((folderName) => {
		const folderDiv = document.createElement('div');
		folderDiv.className = 'folder-container';

		const folderHeader = document.createElement('div');
		folderHeader.className = 'folder-header';
		folderHeader.innerHTML = `
            <div class="folder-icon">📁</div>
            <div class="folder-name">${folderName}</div>
            <button class="folder-toggle">▼</button>
        `;

		const folderContent = document.createElement('div');
		folderContent.className = 'folder-content';

		// Make folder expandable/collapsible
		folderHeader.addEventListener('click', () => {
			folderContent.classList.toggle('collapsed');
			const toggle = folderHeader.querySelector('.folder-toggle');
			toggle.textContent = folderContent.classList.contains('collapsed') ? '▶' : '▼';
		});

		folderDiv.appendChild(folderHeader);
		folderDiv.appendChild(folderContent);
		container.appendChild(folderDiv);

		// Recursively render folder contents
		const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
		renderFolderStructure(structure.folders[folderName], folderContent, newPath);
	});

	// Render files
	structure.files.forEach((file) => {
		const fileCard = document.createElement('div');
		fileCard.className = 'file-card selectable';
		fileCard.dataset.path = file.path;

		// Enable drag-to-download
		fileCard.draggable = true;
		fileCard.addEventListener('dragstart', (e) => {
			e.dataTransfer.setData('text/uri-list', window.location.origin + '/files' + file.path);
			e.dataTransfer.setData('text/plain', file.name);
		});

		const fileIcon = getFileIcon(file.name);
		const fileSize = formatFileSize(file.size);
		const uploadDate = new Date(file.uploadedAt).toLocaleString();
		const isPDF = file.name.toLowerCase().endsWith('.pdf');
		const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);
		const isVideo = /\.(mp4|webm|ogg|mov|avi)$/i.test(file.name);
		const isPreviewable = isImage || isVideo || isPDF;
		const isSelected = selectedFilePaths.has(file.path);

		// Build thumbnail for images
		let thumbnailHtml = '';
		if (isImage) {
			thumbnailHtml = `<img src="/files${file.path}" class="file-thumbnail" alt="${file.name}" loading="lazy" onerror="this.style.display='none'"/>`;
		}

		fileCard.innerHTML = `
				<div class="file-card-checkbox" onclick="event.stopPropagation(); toggleFileSelection('${file.path}')">${isSelected ? '✓' : ''}</div>
				${thumbnailHtml}
				<div class="file-card-icon">${fileIcon}</div>
				<div class="file-card-name" title="${file.name}">${file.name}</div>
				<div class="file-card-info">
					${fileSize} • ${uploadDate}
				</div>
				<div class="file-card-actions">
					${isPreviewable ? `<button class="btn btn-preview" onclick="event.stopPropagation(); previewFile('${file.path}', '${file.name}')">Preview</button>` : ''}
					${isPDF ? `<button class="btn btn-print" onclick="event.stopPropagation(); requestPrint('${file.path}', '${file.name}')">Direct Print</button>` : ''}
					<button class="btn btn-download" onclick="event.stopPropagation(); downloadFile('${file.path}', '${file.name}')">Download</button>
					<button class="btn btn-delete" onclick="event.stopPropagation(); deleteFile('${file.path}', '${file.name}')">Delete</button>
				</div>
			`;

		if (isSelected) {
			fileCard.classList.add('selected');
		}

		// Click to select
		fileCard.addEventListener('click', () => {
			toggleFileSelection(file.path);
		});

		container.appendChild(fileCard);
	});
}

// Download file
function downloadFile(filePath, fileName) {
	const link = document.createElement('a');
	link.href = '/files' + filePath;
	link.download = fileName;
	link.click();
	showNotification('Downloading ' + fileName, 'success');
}

// Print PDF — server-side direct print
async function printPDF(filePath) {
	const fileName = filePath.split('/').pop();
	await requestPrint(filePath, fileName);
}

// Delete file
async function deleteFile(filePath, fileName) {
	if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
		return;
	}

	try {
		const response = await fetch('/delete' + filePath, {
			method: 'DELETE',
		});

		const result = await response.json();

		if (response.ok) {
			showNotification('File deleted successfully', 'success');
			loadFiles();
		} else {
			throw new Error(result.error || 'Delete failed');
		}
	} catch (error) {
		console.error('Delete error:', error);
		showNotification('Failed to delete file', 'error');
	}
}

// Get file icon based on extension
function getFileIcon(filename) {
	const ext = filename.split('.').pop().toLowerCase();

	const icons = {
		pdf: '📄',
		doc: '📝',
		docx: '📝',
		xls: '📊',
		xlsx: '📊',
		ppt: '📊',
		pptx: '📊',
		jpg: '🖼️',
		jpeg: '🖼️',
		png: '🖼️',
		gif: '🖼️',
		svg: '🖼️',
		mp4: '🎬',
		avi: '🎬',
		mov: '🎬',
		mp3: '🎵',
		wav: '🎵',
		zip: '📦',
		rar: '📦',
		'7z': '📦',
		txt: '📃',
		html: '🌐',
		css: '🎨',
		js: '⚙️',
		exe: '⚙️',
		default: '📄',
	};

	return icons[ext] || icons['default'];
}

// Format file size
function formatFileSize(bytes) {
	if (!bytes || bytes === 0 || !isFinite(bytes)) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);

	return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Show notification
function showNotification(message, type) {
	const notification = document.getElementById('notification');
	notification.textContent = message;
	notification.className = `notification ${type}`;
	notification.classList.remove('hidden');

	setTimeout(() => {
		notification.classList.add('hidden');
	}, 3000);
}

// Load files on page load
loadFiles();

// Search functionality
if (searchInput) {
	searchInput.addEventListener('input', (e) => {
		searchFiles(e.target.value);
	});
}

// Extension filter functionality
if (extensionFilter) {
	extensionFilter.addEventListener('change', (e) => {
		filterByExtension(e.target.value);
	});
}

// Render files page with pagination
function renderFilesPage(filesToRender = null) {
	const filesGrid = document.getElementById('filesList-shared');
	const files = filesToRender || allFiles;

	if (files.length === 0) {
		filesGrid.innerHTML = '<p class="no-files">No files uploaded yet</p>';
		updatePaginationControls(0);
		return;
	}

	// Calculate pagination
	const totalPages = Math.ceil(files.length / filesPerPage);
	const startIndex = (currentPage - 1) * filesPerPage;
	const endIndex = Math.min(startIndex + filesPerPage, files.length);
	const pageFiles = files.slice(startIndex, endIndex);

	// Build folder structure for current page
	const folderStructure = buildFolderStructure(pageFiles);

	// Clear and render
	filesGrid.innerHTML = '';
	renderFolderStructure(folderStructure, filesGrid, '');

	// Update pagination controls
	updatePaginationControls(totalPages);
}

// Update pagination control states
function updatePaginationControls(totalPages) {
	if (!currentPageSpan || !totalPagesSpan || !prevPageBtn || !nextPageBtn) return;

	currentPageSpan.textContent = totalPages === 0 ? '0' : currentPage;
	totalPagesSpan.textContent = totalPages;

	prevPageBtn.disabled = currentPage <= 1;
	nextPageBtn.disabled = currentPage >= totalPages || totalPages === 0;
}

// Pagination event handlers
if (prevPageBtn) {
	prevPageBtn.addEventListener('click', () => {
		if (currentPage > 1) {
			currentPage--;
			const searchQuery = searchInput ? searchInput.value : '';
			const extension = extensionFilter ? extensionFilter.value : '';
			if (searchQuery || extension) {
				filterFiles(searchQuery, extension);
			} else {
				renderFilesPage();
			}
		}
	});
}

if (nextPageBtn) {
	nextPageBtn.addEventListener('click', () => {
		const searchQuery = searchInput ? searchInput.value : '';
		const extension = extensionFilter ? extensionFilter.value : '';
		let totalFiles = allFiles;

		// Recalculate based on current filters
		if (extension) {
			totalFiles = totalFiles.filter((file) => {
				const fileExt = file.name.split('.').pop().toLowerCase();
				return fileExt === extension.toLowerCase();
			});
		}

		if (searchQuery && searchQuery.trim() !== '') {
			const searchLower = searchQuery.toLowerCase();
			totalFiles = totalFiles.filter((file) => {
				const fileName = file.name.toLowerCase();
				const filePath = file.path.toLowerCase();
				return fileName.includes(searchLower) || filePath.includes(searchLower);
			});
		}

		const totalPages = Math.ceil(totalFiles.length / filesPerPage);
		if (currentPage < totalPages) {
			currentPage++;
			if (searchQuery || extension) {
				filterFiles(searchQuery, extension);
			} else {
				renderFilesPage();
			}
		}
	});
}
// ============================================
// WebSocket for Real-Time File Updates
// ============================================

let wsConnection = null;
let wsReconnectAttempts = 0;
const wsMaxReconnectAttempts = 10;
const wsReconnectDelay = 3000;

// Create connection status indicator
const connectionStatus = document.createElement('div');
connectionStatus.className = 'connection-status disconnected';
connectionStatus.innerHTML = '<span class="status-dot"></span><span class="status-text">Disconnected</span>';
document.body.appendChild(connectionStatus);

function updateConnectionStatus(status) {
	connectionStatus.className = 'connection-status ' + status;
	const statusText = connectionStatus.querySelector('.status-text');
	switch (status) {
		case 'connected':
			statusText.textContent = 'Live';
			break;
		case 'disconnected':
			statusText.textContent = 'Offline';
			break;
		case 'reconnecting':
			statusText.textContent = 'Reconnecting...';
			break;
	}
}

function initWebSocket() {
	// Determine WebSocket URL based on current page location
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	const wsUrl = `${protocol}//${window.location.host}`;

	console.log('Connecting to WebSocket:', wsUrl);
	updateConnectionStatus('reconnecting');

	try {
		wsConnection = new WebSocket(wsUrl);

		wsConnection.onopen = () => {
			console.log('✓ WebSocket connected - Real-time updates enabled');
			wsReconnectAttempts = 0;
			updateConnectionStatus('connected');
		};

		wsConnection.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				handleWebSocketMessage(data);
			} catch (error) {
				console.error('WebSocket message parse error:', error);
			}
		};

		wsConnection.onclose = () => {
			console.log('WebSocket disconnected');
			wsConnection = null;
			updateConnectionStatus('disconnected');
			attemptReconnect();
		};

		wsConnection.onerror = (error) => {
			console.error('WebSocket error:', error);
			updateConnectionStatus('disconnected');
		};
	} catch (error) {
		console.error('Failed to create WebSocket:', error);
		updateConnectionStatus('disconnected');
		attemptReconnect();
	}
}

function attemptReconnect() {
	if (wsReconnectAttempts < wsMaxReconnectAttempts) {
		wsReconnectAttempts++;
		console.log(`WebSocket reconnecting... (attempt ${wsReconnectAttempts}/${wsMaxReconnectAttempts})`);
		updateConnectionStatus('reconnecting');
		setTimeout(initWebSocket, wsReconnectDelay);
	} else {
		// Reset counter and retry after a longer delay so the client recovers
		// automatically if the server restarts while the page is open
		console.warn(`WebSocket: max attempts reached, retrying in 30s…`);
		updateConnectionStatus('disconnected');
		wsReconnectAttempts = 0;
		setTimeout(initWebSocket, 30000);
	}
}

function handleWebSocketMessage(data) {
	switch (data.type) {
		case 'connected':
			console.log('WebSocket:', data.message);
			// Handle active uploaders from initial connection
			if (data.activeUploaders && data.activeUploaders.length > 0) {
				updateUploadActivity(data.activeUploaders);
			}
			break;

		case 'fileUpdate':
			console.log(`File ${data.action} event received:`, data.files);

			// Debounced reload to prevent rapid reloads
			debouncedLoadFiles();

			// Show notification
			if (data.action === 'upload') {
				const count = data.files.length;
				showNotification(`${count} file${count !== 1 ? 's' : ''} uploaded`, 'success');
			} else if (data.action === 'delete') {
				showNotification('File(s) deleted', 'info');
			}
			break;

		case 'uploadActivity':
			updateUploadActivity(data.uploaders);
			break;

		default:
			console.log('Unknown WebSocket message type:', data.type);
	}
}

// Update upload activity indicator
function updateUploadActivity(uploaders) {
	if (!uploadActivity || !activityList) return;

	if (uploaders.length === 0) {
		uploadActivity.classList.add('hidden');
		return;
	}

	uploadActivity.classList.remove('hidden');
	activityList.innerHTML = uploaders
		.map(
			(uploader) => `
		<div class="activity-item">
			<div class="pulse"></div>
			<span class="filename">${uploader.filename || 'Unknown file'}</span>
			<div class="progress-mini">
				<div class="progress-mini-fill" style="width: ${uploader.progress || 0}%"></div>
			</div>
		</div>
	`,
		)
		.join('');
}

// Report upload activity to server
async function reportUploadActivity(action, filename = '', progress = 0) {
	try {
		await fetch('/upload-activity', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ clientId, action, filename, progress }),
		});
	} catch (error) {
		// Silent fail - activity reporting is non-critical
	}
}

// Initialize WebSocket on page load
initWebSocket();

// ============================================
// Theme Toggle (Dark/Light Mode)
// ============================================

function initTheme() {
	const savedTheme = localStorage.getItem('shareme-theme') || 'light';
	document.documentElement.setAttribute('data-theme', savedTheme);
	updateThemeIcon(savedTheme);
}

function toggleTheme() {
	const currentTheme = document.documentElement.getAttribute('data-theme');
	const newTheme = currentTheme === 'light' ? 'dark' : 'light';
	document.documentElement.setAttribute('data-theme', newTheme);
	localStorage.setItem('shareme-theme', newTheme);
	updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
	if (themeToggle) {
		themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
	}
}

if (themeToggle) {
	themeToggle.addEventListener('click', toggleTheme);
}

initTheme();

// ============================================
// File Selection & Bulk Operations
// ============================================

function toggleFileSelection(filePath) {
	if (selectedFilePaths.has(filePath)) {
		selectedFilePaths.delete(filePath);
	} else {
		selectedFilePaths.add(filePath);
	}
	updateFileCardSelection(filePath);
	updateBulkActionsBar();
}

function updateFileCardSelection(filePath) {
	const fileCard = document.querySelector(`.file-card[data-path="${filePath}"]`);
	if (fileCard) {
		const checkbox = fileCard.querySelector('.file-card-checkbox');
		if (selectedFilePaths.has(filePath)) {
			fileCard.classList.add('selected');
			if (checkbox) checkbox.textContent = '✓';
		} else {
			fileCard.classList.remove('selected');
			if (checkbox) checkbox.textContent = '';
		}
	}
}

function updateBulkActionsBar() {
	if (!bulkActions) return;

	const count = selectedFilePaths.size;
	if (count > 0) {
		bulkActions.classList.remove('hidden');
		if (selectedCountSpan) {
			selectedCountSpan.textContent = `${count} selected`;
		}
	} else {
		bulkActions.classList.add('hidden');
	}
}

function selectAllFiles() {
	// Get currently visible/filtered files
	const searchQuery = searchInput ? searchInput.value : '';
	const extension = extensionFilter ? extensionFilter.value : '';
	let files = allFiles;

	if (extension) {
		files = files.filter((f) => f.name.split('.').pop().toLowerCase() === extension.toLowerCase());
	}
	if (searchQuery) {
		const q = searchQuery.toLowerCase();
		files = files.filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
	}

	files.forEach((f) => selectedFilePaths.add(f.path));
	renderFilesPage();
	updateBulkActionsBar();
}

function clearSelection() {
	selectedFilePaths.clear();
	renderFilesPage();
	updateBulkActionsBar();
}

async function bulkDeleteFiles() {
	if (selectedFilePaths.size === 0) return;

	const count = selectedFilePaths.size;
	if (!confirm(`Are you sure you want to delete ${count} file(s)?`)) return;

	try {
		const files = Array.from(selectedFilePaths).map((p) => (p.startsWith('/') ? p.slice(1) : p));
		const response = await fetch('/delete-bulk', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ files }),
		});

		const result = await response.json();
		if (result.success) {
			showNotification(result.message, 'success');
			selectedFilePaths.clear();
			loadFiles();
		} else {
			throw new Error(result.error || 'Bulk delete failed');
		}
	} catch (error) {
		console.error('Bulk delete error:', error);
		showNotification('Failed to delete files: ' + error.message, 'error');
	}
}

if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllFiles);
if (clearSelectionBtn) clearSelectionBtn.addEventListener('click', clearSelection);
if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDeleteFiles);

// ============================================
// Sort Functionality
// ============================================

if (sortOption) {
	sortOption.addEventListener('change', (e) => {
		currentSort = e.target.value;
		sortFiles(allFiles);
		currentPage = 1;
		renderFilesPage();
	});
}

// ============================================
// File Preview (Images, Videos, PDFs)
// ============================================

function previewFile(filePath, fileName) {
	if (!previewModal || !previewContainer) return;

	const fileUrl = '/files' + filePath;
	const isImage = /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fileName);
	const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileName);
	const isPDF = /\.pdf$/i.test(fileName);

	let content = '';
	if (isImage) {
		content = `<img src="${fileUrl}" alt="${fileName}" />`;
	} else if (isVideo) {
		content = `<video src="${fileUrl}" controls autoplay></video>`;
	} else if (isPDF) {
		content = `<iframe class="pdf-preview" src="${fileUrl}"></iframe>`;
	}

	previewContainer.innerHTML = content;
	previewModal.classList.remove('hidden');

	// Close on Escape key
	document.addEventListener('keydown', handlePreviewEscape);
}

function closePreview() {
	if (previewModal) {
		previewModal.classList.add('hidden');
		previewContainer.innerHTML = '';
	}
	document.removeEventListener('keydown', handlePreviewEscape);
}

function handlePreviewEscape(e) {
	if (e.key === 'Escape') {
		closePreview();
	}
}

// Make closePreview available globally
window.closePreview = closePreview;
window.previewFile = previewFile;
window.toggleFileSelection = toggleFileSelection;

// ============================================
// Print Controls
// ============================================

const printerSelect = document.getElementById('printerSelect');
const printStatus = document.getElementById('printStatus');

// Load printers from server
async function initPrintSettings() {
	try {
		const [settingsRes, printersRes] = await Promise.all([
			fetch('/print-settings'),
			fetch('/printers'),
		]);

		if (!settingsRes.ok || !printersRes.ok) {
			console.warn(`Print endpoints not available (settings: ${settingsRes.status}, printers: ${printersRes.status})`);
			if (printerSelect) printerSelect.innerHTML = '<option value="">🖨️ Default Printer</option>';
			return;
		}

		const settings = await settingsRes.json();
		const { printers } = await printersRes.json();

		if (printerSelect) {
			printerSelect.innerHTML = '<option value="">🖨️ Default Printer</option>';
			printers.forEach((name) => {
				const opt = document.createElement('option');
				opt.value = name;
				opt.textContent = name;
				if (name === settings.printer) opt.selected = true;
				printerSelect.appendChild(opt);
			});
		}
	} catch (err) {
		console.warn('Could not load print settings:', err);
		if (printerSelect) printerSelect.innerHTML = '<option value="">🖨️ Default Printer</option>';
	}
}

// Save selected printer to server
async function savePrinter(printer) {
	try {
		await fetch('/print-settings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ printer }),
		});
	} catch (err) {
		console.warn('Could not save printer:', err);
	}
}

function showPrintStatus(message, type = 'success') {
	if (!printStatus) return;
	printStatus.textContent = message;
	printStatus.className = `print-status print-status-${type}`;
	printStatus.classList.remove('hidden');
	setTimeout(() => printStatus.classList.add('hidden'), 4000);
}

if (printerSelect) {
	printerSelect.addEventListener('change', () => {
		savePrinter(printerSelect.value);
	});
}

// Server-side direct print (PDF only)
async function requestPrint(filePath, fileName) {
	const copies = Math.min(Math.max(parseInt(document.getElementById('printCopies')?.value || '1', 10) || 1, 1), 99);
	const paperSize = document.getElementById('paperSizeSelect')?.value || '';
	const colorMode = document.getElementById('colorModeSelect')?.value || 'color';
	const scale = document.getElementById('scaleSelect')?.value || 'fit';

	if (!paperSize) {
		showPrintStatus('⚠️ Please select a paper size before printing.', 'error');
		showNotification('Please select a paper size before printing.', 'error');
		return;
	}

	const colorLabel = colorMode === 'bw' ? 'B&W' : 'Color';
	const scaleLabel = scale === 'fit' ? 'Fit' : scale === 'noscale' ? 'Actual' : 'Shrink';
	showPrintStatus(`🖨️ Sending "${fileName}" ×${copies} [${paperSize}] [${colorLabel}] [${scaleLabel}] to printer…`, 'info');
	try {
		const res = await fetch('/print-file', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ filePath, printer: printerSelect ? printerSelect.value : '', copies, paperSize, colorMode, scale }),
		});
		const data = await res.json();
		if (data.success) {
			showPrintStatus(`✅ "${fileName}" sent to printer`, 'success');
			showNotification(`Print job sent: ${fileName}`, 'success');
			loadPrintHistory();
		} else {
			throw new Error(data.error);
		}
	} catch (err) {
		showPrintStatus(`❌ Print failed: ${err.message}`, 'error');
		showNotification('Print failed: ' + err.message, 'error');
	}
}
window.requestPrint = requestPrint;

// ============================================
// Disk Space Gauge
// ============================================

async function loadDiskSpace() {
	try {
		const res = await fetch('/disk-space');
		if (!res.ok) return;
		const { free, total } = await res.json();
		const fill = document.getElementById('diskSpaceFill');
		const text = document.getElementById('diskSpaceText');
		if (!fill || !text) return;
		if (free === null || total === null || total === 0) {
			text.textContent = 'Storage info unavailable';
			return;
		}
		const pct = Math.round(((total - free) / total) * 100);
		fill.style.width = pct + '%';
		fill.classList.toggle('disk-space-fill-warn', pct > 80 && pct <= 95);
		fill.classList.toggle('disk-space-fill-critical', pct > 95);
		text.textContent = `${formatFileSize(free)} free of ${formatFileSize(total)}`;
	} catch (_) { /* silent */ }
}

// Refresh disk space on load and every 30 seconds
loadDiskSpace();
setInterval(loadDiskSpace, 30000);

// ============================================
// Print History Panel
// ============================================

async function loadPrintHistory() {
	try {
		const res = await fetch('/print-history');
		if (!res.ok) return;
		const { history } = await res.json();
		renderPrintHistory(history);
	} catch (_) { /* silent */ }
}

function renderPrintHistory(history) {
	const list = document.getElementById('printHistoryList');
	if (!list) return;
	if (!history || history.length === 0) {
		list.innerHTML = '<div class="print-history-empty">No print jobs yet</div>';
		return;
	}
	list.innerHTML = history
		.map((item) => {
			const time = new Date(item.timestamp).toLocaleTimeString();
			const icon = item.success ? '✅' : '❌';
			return `<div class="print-history-item ${item.success ? 'success' : 'failed'}">
				<span class="ph-icon">${icon}</span>
				<span class="ph-name" title="${item.file}">${item.file}</span>
				<span class="ph-meta">${item.printer} ×${item.copies}${item.paperSize && item.paperSize !== 'default' ? ' · ' + item.paperSize : ''}${item.colorMode && item.colorMode !== 'color' ? ' · B&W' : ''}${item.scale && item.scale !== 'fit' ? ' · ' + (item.scale === 'noscale' ? 'Actual size' : 'Shrink') : ''}</span>
				<span class="ph-time">${time}</span>
			</div>`;
		})
		.join('');
}

function togglePrintHistory() {
	const list = document.getElementById('printHistoryList');
	const toggle = document.getElementById('printHistoryToggle');
	if (!list || !toggle) return;
	const isHidden = list.classList.contains('hidden');
	list.classList.toggle('hidden', !isHidden);
	toggle.textContent = isHidden ? '▼' : '▶';
	if (isHidden) loadPrintHistory();
}
window.togglePrintHistory = togglePrintHistory;

initPrintSettings();
