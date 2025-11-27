import React, { useState, useEffect } from 'react';

const Lead = ({ lead, onUpdateStatus, disabledConfirm }) => {
  // Garantir que lead.status seja sempre string ao inicializar
  const initialStatus = typeof lead?.status === 'string' ? lead.status : '';

  const [status, setStatus] = useState(initialStatus);
  const [isStatusConfirmed, setIsStatusConfirmed] = useState(() => {
    const s = initialStatus;
    return (
      s === 'Em Contato' ||
      s === 'Sem Contato' ||
      s === 'Fechado' ||
      s === 'Perdido' ||
      (typeof s === 'string' && s.startsWith('Agendado'))
    );
  });
  const [showCalendar, setShowCalendar] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');

  // Define a cor do card conforme o status (com guards)
  const safeStartsWith = (v, prefix) => typeof v === 'string' && v.startsWith(prefix);
  const cardColor = (() => {
    const s = typeof status === 'string' ? status : String(status ?? '');
    if (safeStartsWith(s, 'Fechado')) return '#d4edda';
    if (safeStartsWith(s, 'Perdido')) return '#f8d7da';
    if (safeStartsWith(s, 'Em Contato')) return '#fff3cd';
    if (safeStartsWith(s, 'Sem Contato')) return '#e2e3e5';
    if (safeStartsWith(s, 'Agendado')) return '#cce5ff';
    if (s === 'Selecione o status' || s === '') return '#ffffff';
    return '#ffffff';
  })();

  // Sincroniza o estado `isStatusConfirmed` quando o `lead.status` muda
  useEffect(() => {
    const s = typeof lead?.status === 'string' ? lead.status : '';
    setIsStatusConfirmed(
      s === 'Em Contato' ||
      s === 'Sem Contato' ||
      s === 'Fechado' ||
      s === 'Perdido' ||
      (typeof s === 'string' && s.startsWith('Agendado'))
    );
    setStatus(s);
    // Se o status atual for 'Agendar' ou iniciar com 'Agendado', exibe calendário conforme necessário
    setShowCalendar(safeStartsWith(s, 'Agendado') || s === 'Agendar');
  }, [lead?.status]);

  const handleConfirm = () => {
    if (!status || status === 'Selecione o status') {
      alert('Selecione um status antes de confirmar!');
      return;
    }

    enviarLeadAtualizado(lead.id, status, lead.phone);

    setIsStatusConfirmed(true);

    if (onUpdateStatus) {
      onUpdateStatus(lead.id, status, lead.phone);
    }
  };

  const handleScheduleConfirm = () => {
    if (!scheduledDate) {
      alert('Selecione uma data para o agendamento!');
      return;
    }

    const selectedDate = new Date(scheduledDate + 'T00:00:00');
    const formattedDate = selectedDate.toLocaleDateString('pt-BR');
    const newStatus = `Agendado - ${formattedDate}`;

    enviarLeadAtualizado(lead.id, newStatus, lead.phone);
    setStatus(newStatus);
    setIsStatusConfirmed(true);
    setShowCalendar(false);

    if (onUpdateStatus) {
      onUpdateStatus(lead.id, newStatus, lead.phone);
    }
  };

  const handleAlterar = () => {
    setIsStatusConfirmed(false);
    setShowCalendar(false);
  };

  const enviarLeadAtualizado = async (leadId, status, phone) => {
    try {
      await fetch('https://script.google.com/macros/s/AKfycbzSkLIDEJUeJMf8cQestU8jVAaafHPPStvYsnsJMbgoNyEXHkmz4eXica0UOEdUQFea/exec?v=alterar_status', {
        method: 'POST',
        body: JSON.stringify({
          lead: leadId,
          status: status,
          phone: phone
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Erro ao enviar lead:', error);
    }
  };

  return (
    <div
      style={{
        border: '1px solid #ddd',
        padding: '15px',
        marginBottom: '15px',
        borderRadius: '5px',
        backgroundColor: cardColor,
        position: 'relative'
      }}
    >
      {isStatusConfirmed && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            padding: '5px 10px',
            borderRadius: '5px',
            backgroundColor: '#007bff',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          {status}
        </div>
      )}

      <p><strong>Nome:</strong> {lead?.name ?? ''}</p>
      <p><strong>Modelo do veículo:</strong> {lead?.vehicleModel ?? ''}</p>
      <p><strong>Ano/Modelo:</strong> {lead?.vehicleYearModel ?? ''}</p>
      <p><strong>Cidade:</strong> {lead?.city ?? ''}</p>
      <p><strong>Telefone:</strong> {lead?.phone ?? ''}</p>
      <p><strong>Tipo de Seguro:</strong> {lead?.insuranceType ?? ''}</p>

      <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <select
          value={status}
          onChange={(e) => {
            const newStatus = e.target.value;
            setStatus(newStatus);
            if (newStatus === 'Agendar') {
              setShowCalendar(true);
            } else {
              setShowCalendar(false);
            }
          }}
          disabled={isStatusConfirmed}
          style={{
            marginRight: '10px',
            padding: '8px',
            border: '2px solid #ccc',
            borderRadius: '4px',
            minWidth: '160px',
            backgroundColor: isStatusConfirmed ? '#e9ecef' : '#fff',
            cursor: isStatusConfirmed ? 'not-allowed' : 'pointer'
          }}
        >
          <option value="">Selecione o status</option>
          <option value="Agendar">Agendar</option>
          <option value="Em Contato">Em Contato</option>
          <option value="Fechado">Fechado</option>
          <option value="Perdido">Perdido</option>
          <option value="Sem Contato">Sem Contato</option>
        </select>

        {!isStatusConfirmed ? (
          <>
            {showCalendar ? (
              <>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  style={{
                    padding: '8px',
                    border: '2px solid #ccc',
                    borderRadius: '4px'
                  }}
                />
                <button
                  onClick={handleScheduleConfirm}
                  disabled={!scheduledDate}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: !scheduledDate ? '#aaa' : '#007bff',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: !scheduledDate ? 'not-allowed' : 'pointer'
                  }}
                >
                  Confirmar Agendamento
                </button>
              </>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={disabledConfirm || !status || status === '' || status === 'Selecione o status'}
                style={{
                  padding: '8px 16px',
                  backgroundColor: (disabledConfirm || !status || status === '' || status === 'Selecione o status') ? '#aaa' : '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (disabledConfirm || !status || status === '' || status === 'Selecione o status') ? 'not-allowed' : 'pointer'
                }}
              >
                Confirmar
              </button>
            )}
          </>
        ) : (
          <button
            onClick={handleAlterar}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ffc107',
              color: '#212529',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Alterar
          </button>
        )}
      </div>
    </div>
  );
};

export default Lead;
