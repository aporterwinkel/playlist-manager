import React, { useState, useMemo, useEffect } from 'react';
import { Droppable, Draggable, DragDropContext } from 'react-beautiful-dnd';
import EntryTypeBadge from '../EntryTypeBadge';
import Snackbar from '../Snackbar';
import axios from 'axios';
import mapToTrackModel from '../../lib/mapToTrackModel';
import '../../styles/PlaylistGrid.css';
import SearchResultsGrid from '../search/SearchResultsGrid';
import PlaylistItemContextMenu from './PlaylistItemContextMenu';
import { FaUndo, FaRedo } from 'react-icons/fa';

const BatchActions = ({ selectedCount, onRemove, onClear }) => (
  <div className="batch-actions" style={{ minHeight: '40px', visibility: selectedCount > 0 ? 'visible' : 'hidden' }}>
    <button onClick={onRemove}>
      Remove {selectedCount} Selected Tracks
    </button>
    <button onClick={onClear}>
      Clear Selection
    </button>
  </div>
);

const PlaylistGrid = ({
  playlistID,
}) => {
  const [sortColumn, setSortColumn] = useState('order');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filter, setFilter] = useState('');
  const [entries, setEntries] = useState([]);
  const [name, setName] = useState('');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info'
  });
  const [selectedEntries, setSelectedEntries] = useState([]);
  const allEntriesSelected = selectedEntries.length === entries.length;
  const [allPlaylistEntriesSelected, setAllTracksSelected] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, track: null });
  const [searchFilter, setSearchFilter] = useState('');
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    fetchPlaylistDetails(playlistID);
  }, [playlistID]); // Only re-fetch when playlistID changes

  useEffect(() => {
    if (!isInitialLoad) {
      writeToDB();
    } else {
      setIsInitialLoad(false);
    }
  }, [entries]);

  const fetchPlaylistDetails = async (playlistId) => {
    try {
      const response = await axios.get(`/api/playlists/${playlistId}`);
      setName(response.data.name);
      setIsInitialLoad(true);  // Set flag before updating entries
      setEntries(response.data.entries.map(entry => mapToTrackModel(entry)))
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };

  const writeToDB = async () => {
    try {
      await axios.put(`/api/playlists/${playlistID}`, {
        name: name, // Playlist name is not needed for update
        entries: entries
      });
    } catch (error) {
      console.error('Error writing playlist to DB:', error);
    }
  };

  const pushToHistory = (entries) => {
    const newHistory = history.slice(0, historyIndex + 1);
    setHistory([...newHistory, entries]);
    setHistoryIndex(historyIndex + 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setEntries(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setEntries(history[historyIndex + 1]);
    }
  };

  const addTracksToPlaylist = async (tracks) => {
    const tracksToAdd = Array.isArray(tracks) ? tracks : [tracks];

    pushToHistory(entries);

    const newEntries = [
      ...entries,
      ...tracksToAdd.map((s, idx) => ({
        ...mapToTrackModel(s),
        order: idx + entries.length, music_file_id: s.id, 
        entry_type: s.entry_type, url: s.url, details: s
      }))
    ];
    
    setEntries(newEntries);
      
    setSnackbar({
      open: true,
      message: `Added ${tracksToAdd.length} tracks to ${name}`,
      severity: 'success'
    });
  };

  const handleRenamePlaylist = async (newName) => {
    setName(newName, () => {
      axios.post(`/api/playlists/rename/${playlistID}`, { new_name: newName, description: "" });
    });
  };

  const onRemoveByAlbum = async (album) => {
    setEntries(entries.filter(entry => entry.album === album).map(entry => entry.order));
  }

  const onRemoveByArtist = async (artist) => {
    setEntries(entries.filter(entry => entry.artist === artist).map(entry => entry.order));
  }

  const addSongsToPlaylist = async (songs) => {
    const songsArray = Array.isArray(songs) ? songs : [songs];
    await addTracksToPlaylist(songsArray);
  };

  const removeSongsFromPlaylist = async (indexes) => {
    if ((indexes.length > 1) && !window.confirm(`Are you sure you want to remove ${indexes.length} entries from the playlist?`)) {
      return;
    }

    pushToHistory(entries);

    const newEntries = entries
      .filter((_, index) => !indexes.includes(index))
      .map((entry, index) => ({ ...entry, order: index }));
    
    setEntries(newEntries);
  }

  const exportPlaylist = async () => {
    try {
      const response = await axios.get(`/api/playlists/${playlistID}/export`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${name}.m3u`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting playlist:', error);
    }
  };

  const onSyncToPlex = async () => {
    try {
      await axios.get(`/api/playlists/${playlistID}/synctoplex`);
      
      setSnackbar({
        open: true,
        message: `'${name}' synced to Plex`
      })
    } catch (error) {
      console.error('Error exporting playlist:', error);
    }
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    if (sortColumn !== 'order') {
      return;
    }

    const { source, destination } = result;

    // If dragging within playlist
    if (source.droppableId === 'playlist' && destination.droppableId === 'playlist') {
      const updatedTracks = Array.from(entries);
      const [movedTrack] = updatedTracks.splice(source.index, 1);
      updatedTracks.splice(destination.index, 0, movedTrack);
      
      const updatedEntries = updatedTracks.map((track, index) => ({
        ...track,
        order: index,
      }));

      setEntries(updatedEntries);
    }
  };

  const toggleTrackSelection = (index) => {
    setSelectedEntries(prev => {
      const newSelection = prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index];
      setAllTracksSelected(newSelection.length === entries.length);
      return newSelection;
    });
  };

  const clearTrackSelection = () => {
    setSelectedEntries([]);
  };

  const removeSelectedTracks = async () => {
    removeSongsFromPlaylist(selectedEntries);
    clearTrackSelection();
  };

  const toggleAllTracks = () => {
    if (allPlaylistEntriesSelected) {
      setSelectedEntries([]);
    } else {
      setSelectedEntries(entries.map((_, index) => index));
    }
    setAllTracksSelected(!allPlaylistEntriesSelected);
  };

  const handleShowTrackDetails = (track) => {
    setSelectedTrack(track);
    setShowTrackDetails(true);
  };

  const handleContextMenu = (e, track) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      track: track
    });
  };

  const handleSnackbarClose = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    const multiplier = sortDirection === 'asc' ? 1 : -1;
    
    switch (sortColumn) {
      case 'order':
        return (a.order - b.order) * multiplier;
      case 'type':
        return a.entry_type.localeCompare(b.entry_type) * multiplier;
      case 'artist':
        return (a.artist || a.album_artist || '').localeCompare(b.artist || b.album_artist || '') * multiplier;
      case 'title':
        return a.title.localeCompare(b.title) * multiplier;
      default:
        return 0;
    }
  });

  const filteredEntries = useMemo(() => {
    if (!filter) return sortedEntries;
    
    const searchTerm = filter.toLowerCase();
    return sortedEntries.filter(entry => {
      const title = entry.details?.title?.toLowerCase() || '';
      const artist = entry.details?.artist?.toLowerCase() || '';
      const album = entry.details?.album?.toLowerCase() || '';
      const source = entry.entry_type?.toLowerCase() || '';
      
      return title.includes(searchTerm) ||
             artist.includes(searchTerm) ||
             album.includes(searchTerm) ||
             source.includes(searchTerm);
    });
  }, [sortedEntries, filter]);

  const searchFor = (query) => {
    setSearchFilter(query);
    setSearchPanelOpen(true);
  }

  const getSortIndicator = (column) => {
    if (sortColumn !== column) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  return (
    <div>
      <h2>{name}</h2>
      <div className="playlist-controls">
        <div className="history-controls">
          <button 
            onClick={undo} 
            disabled={historyIndex <= 0}
            title="Undo"
          >
            <FaUndo />
          </button>
          <button 
            onClick={redo} 
            disabled={historyIndex >= history.length - 1}
            title="Redo"
          >
            <FaRedo />
          </button>
        </div>

        <div className="filter-container">
          <input
            type="text"
            placeholder="Filter playlist..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-input"
          />
          {filter && (
            <button 
              className="clear-filter"
              onClick={() => setFilter('')}
            >
              Clear
            </button>
          )}
          <span className="filter-count">
            {filteredEntries.length} of {entries.length} tracks
          </span>
        </div>

        <BatchActions 
          selectedCount={selectedEntries.length}
          onRemove={removeSelectedTracks}
          onClear={clearTrackSelection}
        />
      </div>

      <div className="playlist-container">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="playlist-grid-header-row">
            <div className="grid-cell">
              <input type="checkbox" checked={allEntriesSelected} onChange={toggleAllTracks} />
            </div>
            <div className="grid-cell clickable" onClick={() => handleSort('order')}>
              Source {getSortIndicator('order')}
            </div>
            <div className="grid-cell clickable" onClick={() => handleSort('artist')}>
              Artist/Album {getSortIndicator('artist')}
            </div>
            <div className="grid-cell clickable" onClick={() => handleSort('title')}>
              Song {getSortIndicator('title')}
            </div>
          </div>

          <Droppable droppableId="playlist">
            {(provided) => (
              <div className="playlist-grid-content" {...provided.droppableProps} ref={provided.innerRef}>
                {filteredEntries.map((track, index) => (
                  <Draggable 
                    key={index} 
                    draggableId={index.toString()} 
                    index={index}
                    isDragDisabled={sortColumn !== 'order'} // Add this line
                  >
                    {(provided, snapshot) => (
                      <div 
                        className={`playlist-grid-row ${sortColumn !== 'order' ? 'drag-disabled' : ''} ${snapshot.isDragging ? 'dragging' : ''}`}
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        onClick={() => toggleTrackSelection(track.order)}
                        onContextMenu={(e) => handleContextMenu(e, track)}
                      >
                        <div className="grid-cell">
                          <input
                            type="checkbox"
                            checked={selectedEntries.includes(track.order)}
                            readOnly
                          />
                        </div>
                        <div className="grid-cell">
                          <EntryTypeBadge type={track.entry_type} />
                          <span>{track.order + 1}</span>
                        </div>
                        <div className="grid-cell">
                          {track.image_url && <div><img style={{height: 40}} src={track.image_url}/></div>}
                          <div>{track.artist || track.album_artist}</div>
                          {track.album && <div><i>{track.album}</i></div>}
                        </div>
                        <div className="grid-cell"
                        >
                          {track.missing ? <s>{track.title}</s> : track.title}
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      <SearchResultsGrid
        filter={searchFilter}
        onAddSongs={addSongsToPlaylist}
        visible={searchPanelOpen}
      />

      {contextMenu.visible && (
        <PlaylistItemContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          track={contextMenu.track}
          onClose={() => setContextMenu({ visible: false })}
          onFilterByAlbum={() => searchFor(contextMenu.track.album)}
          onFilterByArtist={() => searchFor(contextMenu.track.artist)}
          onAddTracks={(tracks) => addSongsToPlaylist(tracks)}
        />
      )}

      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={handleSnackbarClose}
      />
    </div>
  );
};

export default PlaylistGrid;