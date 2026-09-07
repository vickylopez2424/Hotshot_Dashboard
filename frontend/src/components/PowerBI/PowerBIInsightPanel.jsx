import React from 'react';
import { PowerBIEmbed } from 'powerbi-client-react';
import { models } from 'powerbi-client';
import { BarChart3, Database, LineChart, PanelsTopLeft } from 'lucide-react';
import './PowerBIInsightPanel.css';

const POWERBI_CONFIG = {
  reportId: process.env.REACT_APP_POWERBI_REPORT_ID,
  embedUrl: process.env.REACT_APP_POWERBI_EMBED_URL,
  accessToken: process.env.REACT_APP_POWERBI_ACCESS_TOKEN,
};

const hasPowerBIConfig =
  POWERBI_CONFIG.reportId &&
  POWERBI_CONFIG.embedUrl &&
  POWERBI_CONFIG.accessToken;

function PowerBIInsightPanel() {
  const embedConfig = hasPowerBIConfig
    ? {
        type: 'report',
        id: POWERBI_CONFIG.reportId,
        embedUrl: POWERBI_CONFIG.embedUrl,
        accessToken: POWERBI_CONFIG.accessToken,
        tokenType: models.TokenType.Embed,
        settings: {
          background: models.BackgroundType.Transparent,
          panes: {
            filters: { expanded: false, visible: false },
            pageNavigation: { visible: false },
          },
        },
      }
    : null;

  return (
    <section className="powerbi-panel" aria-label="Power BI insights">
      <div className="powerbi-header">
        <div className="powerbi-mark">
          <BarChart3 size={17} strokeWidth={2.5} />
        </div>
        <div>
          <span>Microsoft Power BI</span>
          <strong>Command Analytics</strong>
        </div>
      </div>

      {embedConfig ? (
        <PowerBIEmbed
          embedConfig={embedConfig}
          cssClassName="powerbi-embed"
          getEmbeddedComponent={() => {}}
        />
      ) : (
        <div className="powerbi-preview">
          <div className="powerbi-visual-grid">
            <div className="powerbi-visual-card primary">
              <LineChart size={18} strokeWidth={2.4} />
              <span>Incident Pace</span>
              <strong>78</strong>
            </div>
            <div className="powerbi-visual-card">
              <PanelsTopLeft size={18} strokeWidth={2.4} />
              <span>Reports</span>
              <strong>4</strong>
            </div>
            <div className="powerbi-visual-card">
              <Database size={18} strokeWidth={2.4} />
              <span>Datasets</span>
              <strong>Ready</strong>
            </div>
          </div>
          <div className="powerbi-bars" aria-hidden="true">
            <span style={{ height: '46%' }} />
            <span style={{ height: '62%' }} />
            <span style={{ height: '38%' }} />
            <span style={{ height: '76%' }} />
            <span style={{ height: '58%' }} />
            <span style={{ height: '84%' }} />
            <span style={{ height: '68%' }} />
          </div>
        </div>
      )}
    </section>
  );
}

export default PowerBIInsightPanel;
