import { useState } from 'react';
import './Sidebar.css';

export default function Sidebar({
    stops,
    onAddStop,
    onRemoveStop,
    onUpdateStop,
    onMoveStop,
    startTime,
    onStartTimeChange,
    onCalculateRoute,
    isLoading,
    timeMultiplier = 1.0,
    onTimeMultiplierChange
}) {
    const [newStop, setNewStop] = useState('');
    const [error, setError] = useState('');

    const handleAddStop = () => {
        if (newStop.trim()) {
            onAddStop(newStop.trim());
            setNewStop('');
            setError('');
        } else {
            setError('Introduce un nombre de ciudad o coordenadas');
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') {
            handleAddStop();
        }
    };

    // Format date to local datetime-local format (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const handleTimeChange = (e) => {
        // Parse the local datetime value correctly
        const [datePart, timePart] = e.target.value.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const newDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
        onStartTimeChange(newDate);
    };

    return (
        <aside className="sidebar custom-scrollbar">
            <div className="sidebar-content">
                <div className="section-header">
                    <h1>Planificador de Ruta</h1>
                    <p>Ajusta tu viaje</p>
                </div>

                <div className="input-group">
                    <label className="input-label">Añadir Paradas</label>
                    <div className="input-wrapper add-input-group">
                        <span className="material-symbols-outlined input-icon">add_location_alt</span>
                        <input
                            type="text"
                            value={newStop}
                            onChange={(e) => setNewStop(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Añadir punto de ruta..."
                            className="text-input text-input-with-button"
                            disabled={isLoading}
                        />
                        <button
                            onClick={handleAddStop}
                            className="add-btn"
                            disabled={isLoading}
                        >
                            <span className="material-symbols-outlined">add</span>
                        </button>
                    </div>
                    {error && <p className="error-message">{error}</p>}

                    <ul className="stops-list">
                        {stops.map((stop, index) => {
                            let dotClass = 'middle';
                            if (index === 0) dotClass = 'start';
                            if (index > 0 && index === stops.length - 1) dotClass = 'end';

                            return (
                                <li key={stop.id} className="stop-item">
                                    <div className="stop-content">
                                        <div className={`stop-dot ${dotClass}`}></div>
                                        <div className="stop-info">
                                            <p>{stop.name || stop.input}</p>
                                        </div>
                                    </div>
                                    <div className="stop-actions">
                                        <button
                                            onClick={() => onMoveStop(index, 'up')}
                                            disabled={index === 0 || isLoading}
                                            className="icon-action-btn"
                                            title="Mover arriba"
                                        >
                                            <span className="material-symbols-outlined">arrow_upward</span>
                                        </button>
                                        <button
                                            onClick={() => onMoveStop(index, 'down')}
                                            disabled={index === stops.length - 1 || isLoading}
                                            className="icon-action-btn"
                                            title="Mover abajo"
                                        >
                                            <span className="material-symbols-outlined">arrow_downward</span>
                                        </button>
                                        <button
                                            onClick={() => onRemoveStop(stop.id)}
                                            className="icon-action-btn"
                                            disabled={isLoading}
                                            title="Eliminar"
                                        >
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                <div className="input-group">
                    <label className="input-label">Hora de Salida</label>
                    <div className="input-wrapper">
                        <span className="material-symbols-outlined input-icon">schedule</span>
                        <input
                            type="datetime-local"
                            value={formatDateTime(startTime)}
                            onChange={handleTimeChange}
                            className="text-input"
                            disabled={isLoading}
                        />
                    </div>
                </div>

                <div className="input-group">
                    <div className="slider-header">
                        <label className="input-label">Velocidad media del viaje</label>
                        <span className="slider-value">{Math.round((1 / timeMultiplier) * 100)}%</span>
                    </div>
                    <div className="slider-wrapper">
                        <input
                            type="range"
                            min="50"
                            max="150"
                            step="5"
                            value={(1 / timeMultiplier) * 100}
                            onChange={(e) => {
                                const speedPercent = parseFloat(e.target.value);
                                onTimeMultiplierChange(1 / (speedPercent / 100));
                            }}
                            className="range-slider"
                            disabled={isLoading}
                        />
                        <div className="slider-labels">
                            <span>Lento (50%)</span>
                            <span>Normal (100%)</span>
                            <span>Rápido (150%)</span>
                        </div>
                    </div>
                </div>

                {/* Calculate button removed as it is now automatic */}
            </div>
        </aside>
    );
}
