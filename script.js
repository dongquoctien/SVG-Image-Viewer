class SVGViewer {
    constructor() {
        this.svgFiles = [];
        this.currentIndex = 0;
        this.viewMode = 'grid';
        this.folderGroups = {};
        this.expandedFolders = new Set();
        this.rootFolderPath = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // File input
        const fileInput = document.getElementById('fileInput');
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));

        // Folder input
        const folderInput = document.getElementById('folderInput');
        folderInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));

        // Clear button
        document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());

        // View mode buttons
        document.getElementById('gridViewBtn').addEventListener('click', () => this.setViewMode('grid'));
        const listViewBtn = document.getElementById('listViewBtn');
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.setViewMode('list'));
        }

        // Lightbox controls
        document.querySelector('.lightbox-close').addEventListener('click', () => this.closeLightbox());
        document.querySelector('.lightbox-prev').addEventListener('click', () => this.showPrevious());
        document.querySelector('.lightbox-next').addEventListener('click', () => this.showNext());

        // Code popup controls
        document.querySelector('.code-popup-close').addEventListener('click', () => this.closeCodePopup());
        document.getElementById('codePopup').addEventListener('click', (e) => {
            if (e.target.id === 'codePopup') {
                this.closeCodePopup();
            }
        });

        // Copy code buttons - using event delegation
        document.getElementById('codePopup').addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-copy-code')) {
                const btn = e.target;
                const copyType = btn.dataset.copyType;
                const codeElement = copyType === 'html' 
                    ? document.getElementById('code-html')
                    : document.getElementById('code-scss');
                // Get original code from data attribute (before highlighting)
                const code = codeElement.getAttribute('data-code') || codeElement.textContent;
                const success = await this.copyToClipboard(code);
                if (success) {
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    btn.style.background = '#28a745';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '';
                    }, 2000);
                } else {
                    alert('Unable to copy to clipboard. Please copy manually:\n\n' + code);
                }
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (document.getElementById('lightbox').classList.contains('active')) {
                if (e.key === 'Escape') this.closeLightbox();
                if (e.key === 'ArrowLeft') this.showPrevious();
                if (e.key === 'ArrowRight') this.showNext();
            }
            if (document.getElementById('codePopup').classList.contains('active')) {
                if (e.key === 'Escape') this.closeCodePopup();
            }
        });

        // Close lightbox when clicking outside
        document.getElementById('lightbox').addEventListener('click', (e) => {
            if (e.target.id === 'lightbox') {
                this.closeLightbox();
            }
        });
    }

    handleFileSelect(files) {
        const svgFiles = Array.from(files).filter(file => 
            file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
        );

        if (svgFiles.length === 0) {
            alert('No SVG files found!');
            return;
        }

        // Determine root folder path from first file with webkitRelativePath
        const firstFileWithPath = svgFiles.find(f => f.webkitRelativePath);
        if (firstFileWithPath && !this.rootFolderPath) {
            // Get first folder from webkitRelativePath as root
            const pathParts = firstFileWithPath.webkitRelativePath.split('/');
            if (pathParts.length > 1) {
                // Assume selected folder is the first folder in path
                this.rootFolderPath = pathParts[0];
            }
        }

        svgFiles.forEach(file => {
            this.loadSVGFile(file);
        });
    }

    getFolderPath(file) {
        // Get folder path from webkitRelativePath or create from file path
        if (file.webkitRelativePath) {
            const pathParts = file.webkitRelativePath.split('/');
            pathParts.pop(); // Remove filename
            return pathParts.join('/') || 'Root';
        }
        // Single file without webkitRelativePath
        return 'Standalone Files';
    }

    getDisplayFolderPath(folderPath) {
        // Display path starting from /assets/
        if (folderPath === 'Root' || folderPath === 'Standalone Files') {
            return folderPath;
        }
        // Automatically add /assets/ to the beginning of path
        // Example: if folderPath is "images/icons" then display "/assets/images/icons"
        // If folderPath already has "assets/" then just add "/" at the beginning
        if (folderPath.startsWith('assets/')) {
            return `/${folderPath}`;
        }
        // Always add /assets/ to the beginning
        return `/assets/${folderPath}`;
    }

    parseSVGSize(svgContent) {
        // Parse SVG to get width and height
        try {
            // Create a temporary DOM element to parse SVG
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
            const svgElement = svgDoc.querySelector('svg');
            
            if (!svgElement) {
                return { width: 24, height: 24 }; // Default fallback
            }

            let width = svgElement.getAttribute('width');
            let height = svgElement.getAttribute('height');
            const viewBox = svgElement.getAttribute('viewBox');

            // If viewBox exists but no width/height, get from viewBox
            if (viewBox && (!width || !height)) {
                const viewBoxValues = viewBox.split(/\s+/);
                if (viewBoxValues.length >= 4) {
                    width = viewBoxValues[2];
                    height = viewBoxValues[3];
                }
            }

            // Convert to number (remove units if present)
            width = parseFloat(width) || 24;
            height = parseFloat(height) || 24;

            return { width: Math.round(width), height: Math.round(height) };
        } catch (error) {
            console.error('Error parsing SVG:', error);
            return { width: 24, height: 24 }; // Default fallback
        }
    }

    generateSCSS(folderPath) {
        const files = this.folderGroups[folderPath];
        if (!files || files.length === 0) return '';

        let scss = '.icon {\n';
        
        files.forEach(svg => {
            // Create class name from filename (remove extension, convert to kebab-case)
            const fileName = svg.name.replace(/\.svg$/i, '');
            const className = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            
            // Create background path
            let bgPath;
            if (folderPath === 'Root' || folderPath === 'Standalone Files') {
                bgPath = `/assets/${svg.name}`;
            } else {
                // Extract path starting from "assets/" if it exists anywhere in the path
                const assetsIndex = folderPath.indexOf('assets/');
                if (assetsIndex !== -1) {
                    // Use path starting from "assets/"
                    bgPath = `/${folderPath.substring(assetsIndex)}/${svg.name}`;
                } else {
                    bgPath = `/assets/${folderPath}/${svg.name}`;
                }
            }
            
            // Use actual size from SVG (rendered size)
            const width = svg.width || 24;
            const height = svg.height || 24;
            
            scss += `  &.${className} {\n`;
            scss += `    background-image: url(${bgPath});\n`;
            scss += `    width: ${width}px;\n`;
            scss += `    height: ${height}px;\n`;
            scss += `  }\n`;
        });
        
        scss += '}';
        return scss;
    }

    generateSingleSCSS(svg) {
        // Create class name from filename (remove extension, convert to kebab-case)
        const fileName = svg.name.replace(/\.svg$/i, '');
        const className = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        
        // Create background path
        const folderPath = svg.folderPath;
        let bgPath;
        if (folderPath === 'Root' || folderPath === 'Standalone Files') {
            bgPath = `/assets/${svg.name}`;
        } else {
            // Extract path starting from "assets/" if it exists anywhere in the path
            const assetsIndex = folderPath.indexOf('assets/');
            if (assetsIndex !== -1) {
                // Use path starting from "assets/"
                bgPath = `/${folderPath.substring(assetsIndex)}/${svg.name}`;
            } else {
                bgPath = `/assets/${folderPath}/${svg.name}`;
            }
        }
        
        // Use actual size from SVG (rendered size)
        const width = svg.width || 24;
        const height = svg.height || 24;
        
        let scss = `  .${className} {\n`;
        scss += `    background-image: url(${bgPath});\n`;
        scss += `    width: ${width}px;\n`;
        scss += `    height: ${height}px;\n`;
        scss += `  }`;
        
        return scss;
    }

    generateHTML(svg) {
        // Create class name from filename (remove extension, convert to kebab-case)
        const fileName = svg.name.replace(/\.svg$/i, '');
        const className = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        
        return `<span class="icon ${className}"></span>`;
    }

    openCodePopup(index) {
        if (index < 0 || index >= this.svgFiles.length) return;
        
        const svg = this.svgFiles[index];
        const htmlCode = this.generateHTML(svg);
        const scssCode = this.generateSingleSCSS(svg);
        
        // Set icon preview image and filename
        const iconPreview = document.getElementById('code-popup-icon');
        const filenameDisplay = document.getElementById('code-popup-filename');
        if (iconPreview) {
            iconPreview.src = svg.content;
            iconPreview.alt = svg.name;
            // Add dark background if filename contains "white"
            if (svg.name.toLowerCase().includes('white')) {
                iconPreview.classList.add('has-white');
            } else {
                iconPreview.classList.remove('has-white');
            }
        }
        if (filenameDisplay) {
            filenameDisplay.textContent = svg.name;
        }
        
        const htmlElement = document.getElementById('code-html');
        const scssElement = document.getElementById('code-scss');
        
        // Save original code for copying
        htmlElement.setAttribute('data-code', htmlCode);
        scssElement.setAttribute('data-code', scssCode);
        
        // Set code and highlight
        htmlElement.textContent = htmlCode;
        scssElement.textContent = scssCode;
        
        // Highlight code with Prism.js
        if (window.Prism) {
            Prism.highlightElement(htmlElement);
            Prism.highlightElement(scssElement);
        }
        
        const popup = document.getElementById('codePopup');
        popup.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeCodePopup() {
        const popup = document.getElementById('codePopup');
        popup.classList.remove('active');
        document.body.style.overflow = '';
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (err) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    loadSVGFile(file) {
        const folderPath = this.getFolderPath(file);
        let svgContent = '';
        let dataUrl = '';
        
        // Read file as text to parse SVG
        const textReader = new FileReader();
        textReader.onload = (e) => {
            svgContent = e.target.result;
            
            // Parse SVG to get actual size
            const dimensions = this.parseSVGSize(svgContent);
            
            // Create data URL for display
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            const dataUrlReader = new FileReader();
            dataUrlReader.onload = (e) => {
                dataUrl = e.target.result;
                
                const svgData = {
                    name: file.name,
                    size: this.formatFileSize(file.size),
                    content: dataUrl,
                    file: file,
                    folderPath: folderPath,
                    width: dimensions.width,
                    height: dimensions.height
                };

                this.svgFiles.push(svgData);
                
                // Group by folder
                if (!this.folderGroups[folderPath]) {
                    this.folderGroups[folderPath] = [];
                    this.expandedFolders.add(folderPath); // Default: expand all folders
                }
                this.folderGroups[folderPath].push(svgData);
                
                this.updateGallery();
                this.updateFileCount();
            };
            dataUrlReader.readAsDataURL(blob);
        };
        textReader.readAsText(file);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    updateGallery() {
        const gallery = document.getElementById('gallery');
        
        if (this.svgFiles.length === 0) {
            gallery.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📷</div>
                    <p>No SVG files selected</p>
                    <p class="empty-hint">Use the "Select SVG Files" or "Select Folder" button above to get started</p>
                </div>
            `;
            return;
        }

        // Sort folders in order
        const sortedFolders = Object.keys(this.folderGroups).sort((a, b) => {
            if (a === 'Root') return -1;
            if (a === 'Standalone Files') return -1;
            if (b === 'Root') return 1;
            if (b === 'Standalone Files') return 1;
            return a.localeCompare(b);
        });

        gallery.innerHTML = sortedFolders.map(folderPath => {
            const files = this.folderGroups[folderPath];
            const isExpanded = this.expandedFolders.has(folderPath);
            let folderName;
            if (folderPath === 'Root') {
                folderName = 'Root Folder';
            } else if (folderPath === 'Standalone Files') {
                folderName = 'Standalone Files';
            } else {
                folderName = this.getDisplayFolderPath(folderPath);
            }
            const folderId = `folder-${this.escapeHtml(folderPath).replace(/[^a-zA-Z0-9]/g, '-')}`;
            
            return `
                <div class="folder-group" data-folder="${this.escapeHtml(folderPath)}">
                    <div class="folder-header" data-folder-id="${folderId}">
                        <span class="folder-icon">${isExpanded ? '📂' : '📁'}</span>
                        <span class="folder-name">${this.escapeHtml(folderName)}</span>
                        <span class="folder-count">(${files.length} file${files.length !== 1 ? 's' : ''})</span>
                        ${folderPath !== 'Standalone Files' ? `<button class="btn-copy-scss" data-folder-path="${this.escapeHtml(folderPath)}" title="Copy SCSS">📋 Copy SCSS</button>` : ''}
                        <span class="folder-toggle">${isExpanded ? '▼' : '▶'}</span>
                    </div>
                    <div class="folder-content" id="${folderId}" style="display: ${isExpanded ? 'block' : 'none'}">
                        ${files.map(svg => {
                            // Find index of file in svgFiles array
                            const index = this.svgFiles.findIndex(f => f === svg);
                            // Check if filename contains "white" for dark background
                            const hasWhite = svg.name.toLowerCase().includes('white');
                            const previewClass = hasWhite ? 'svg-preview has-white' : 'svg-preview';
                            return `
                                <div class="svg-item" data-index="${index}">
                                    <div class="${previewClass}">
                                        <img src="${svg.content}" alt="${svg.name}" onerror="this.parentElement.innerHTML='<div style=\\'padding:20px;color:#999\\'>Error loading SVG</div>'">
                                    </div>
                                    <div class="svg-info">
                                        <div class="svg-filename">${this.escapeHtml(svg.name)}</div>
                                        <div class="svg-size">${svg.size}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Add click listeners for folder headers
        gallery.querySelectorAll('.folder-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking copy button
                if (e.target.classList.contains('btn-copy-scss')) {
                    return;
                }
                e.stopPropagation();
                const folderPath = header.closest('.folder-group').dataset.folder;
                this.toggleFolder(folderPath);
            });
        });

        // Add click listeners for copy SCSS buttons
        gallery.querySelectorAll('.btn-copy-scss').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const folderPath = btn.dataset.folderPath;
                const scss = this.generateSCSS(folderPath);
                const success = await this.copyToClipboard(scss);
                if (success) {
                    const originalText = btn.textContent;
                    btn.textContent = '✓ Copied!';
                    btn.style.background = '#28a745';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.background = '';
                    }, 2000);
                } else {
                    alert('Unable to copy to clipboard. Please copy manually:\n\n' + scss);
                }
            });
        });

        // Add click listeners for SVG items
        gallery.querySelectorAll('.svg-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(item.dataset.index);
                this.openCodePopup(index);
            });
        });
    }

    toggleFolder(folderPath) {
        if (this.expandedFolders.has(folderPath)) {
            this.expandedFolders.delete(folderPath);
        } else {
            this.expandedFolders.add(folderPath);
        }
        this.updateGallery();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateFileCount() {
        const count = this.svgFiles.length;
        document.getElementById('fileCount').textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
    }

    setViewMode(mode) {
        this.viewMode = mode;
        const gallery = document.getElementById('gallery');
        const gridBtn = document.getElementById('gridViewBtn');
        const listBtn = document.getElementById('listViewBtn');

        if (mode === 'grid') {
            gallery.classList.remove('list-view');
            gallery.classList.add('grid-view');
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        } else {
            gallery.classList.remove('grid-view');
            gallery.classList.add('list-view');
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
        }
    }

    openLightbox(index) {
        this.currentIndex = index;
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');
        const lightboxFilename = document.getElementById('lightbox-filename');
        const lightboxIndex = document.getElementById('lightbox-index');

        const svg = this.svgFiles[index];
        lightboxImg.src = svg.content;
        lightboxImg.alt = svg.name;
        lightboxFilename.textContent = svg.name;
        lightboxIndex.textContent = `${index + 1} / ${this.svgFiles.length}`;

        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    showPrevious() {
        if (this.svgFiles.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.svgFiles.length) % this.svgFiles.length;
        this.openLightbox(this.currentIndex);
    }

    showNext() {
        if (this.svgFiles.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.svgFiles.length;
        this.openLightbox(this.currentIndex);
    }

    clearAll() {
        if (this.svgFiles.length === 0) return;
        
        if (confirm(`Are you sure you want to delete all ${this.svgFiles.length} files?`)) {
            this.svgFiles = [];
            this.folderGroups = {};
            this.expandedFolders.clear();
            this.updateGallery();
            this.updateFileCount();
            this.closeLightbox();
            
            // Reset file inputs
            document.getElementById('fileInput').value = '';
            document.getElementById('folderInput').value = '';
        }
    }
}

// Initialize the viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SVGViewer();
});

