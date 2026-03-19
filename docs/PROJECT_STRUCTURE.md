# Spectra Project Structure

Complete overview of the Spectra project organization.

## Directory Tree

```
spectra/
├── README.md                   # Main documentation
├── LICENSE                     # MIT License with ethical use notice
├── CHANGELOG.md                # Version history and changes
├── requirements.txt            # Python dependencies
├── .env.example                # Environment variables template
├── .gitignore                  # Git ignore rules
│
├── config/                     # Configuration files
│   └── config.yaml             # Main configuration file
│
├── src/                        # Source code
│   ├── __init__.py
│   ├── spectra_cli.py          # Command-line interface
│   │
│   ├── core/                   # Core modules
│   │   ├── __init__.py
│   │   │
│   │   ├── scanner/            # Nuclei scanner integration
│   │   │   ├── __init__.py
│   │   │   └── nuclei_scanner.py
│   │   │
│   │   ├── analyzer/           # AI analysis engine
│   │   │   ├── __init__.py
│   │   │   └── ai_analyzer.py
│   │   │
│   │   ├── reporter/           # Report generation
│   │   │   ├── __init__.py
│   │   │   └── report_generator.py
│   │   │
│   │   └── database/           # Data persistence
│   │       ├── __init__.py
│   │       └── models.py
│   │
│   ├── api/                    # REST API
│   │   ├── __init__.py
│   │   └── app.py              # Flask application
│   │
│   ├── web/                    # Web interface (future)
│   │   ├── static/             # CSS, JS, images
│   │   └── templates/          # HTML templates
│   │
│   └── utils/                  # Utility functions
│       └── __init__.py
│
├── data/                       # Data storage
│   ├── scans/                  # Raw scan results (JSON)
│   ├── reports/                # Generated reports (HTML/JSON/MD)
│   ├── templates/              # Custom templates
│   └── spectra.db              # SQLite database
│
├── logs/                       # Application logs
│   └── spectra.log
│
├── tests/                      # Test suites
│   ├── unit/                   # Unit tests
│   └── integration/            # Integration tests
│
├── docs/                       # Documentation
│   ├── API.md                  # API documentation
│   ├── QUICKSTART.md           # Quick start guide
│   └── PROJECT_STRUCTURE.md    # This file
│
├── scripts/                    # Utility scripts
│   ├── setup.sh                # Initial setup
│   └── start_api.sh            # Start API server
│
└── examples/                   # Example code
    └── simple_scan.py          # Simple usage example
```

## Module Descriptions

### Core Modules

#### `src/core/scanner/nuclei_scanner.py`
**Purpose**: Integration with Nuclei vulnerability scanner

**Key Classes**:
- `NucleiScanner`: Main scanner class

**Key Methods**:
- `scan_target()`: Execute vulnerability scan
- `update_templates()`: Update Nuclei templates
- `_parse_results()`: Parse JSON output

**Dependencies**: subprocess, json, logging

---

#### `src/core/analyzer/ai_analyzer.py`
**Purpose**: AI-powered vulnerability analysis using Llama

**Key Classes**:
- `AIAnalyzer`: AI analysis engine

**Key Methods**:
- `analyze_vulnerabilities()`: Main analysis function
- `_categorize_vulnerabilities()`: Sort by severity/type
- `_calculate_risk_score()`: Risk score calculation
- `_generate_analysis()`: AI analysis via Ollama
- `_generate_recommendations()`: Create action items

**Dependencies**: requests, json, logging

---

#### `src/core/reporter/report_generator.py`
**Purpose**: Generate security reports in multiple formats

**Key Classes**:
- `ReportGenerator`: Report generation engine

**Key Methods**:
- `generate_report()`: Main report generation
- `_generate_json_report()`: JSON format
- `_generate_html_report()`: HTML format
- `_generate_markdown_report()`: Markdown format
- `_compile_report_data()`: Data aggregation

**Dependencies**: json, logging

---

#### `src/core/database/models.py`
**Purpose**: Database operations and data persistence

**Key Classes**:
- `Database`: SQLite database handler

**Key Methods**:
- `init_database()`: Create tables
- `save_scan()`: Store scan results
- `save_analysis()`: Store analysis
- `save_report()`: Store report metadata
- `get_scan()`: Retrieve scan by ID
- `get_all_scans()`: List scans
- `get_vulnerabilities_by_scan()`: Get vulnerabilities

**Database Schema**:
- `scans`: Scan metadata and results
- `vulnerabilities`: Individual vulnerabilities
- `reports`: Report metadata
- `analysis`: AI analysis results

**Dependencies**: sqlite3, json, logging

---

### API Module

#### `src/api/app.py`
**Purpose**: RESTful API server using Flask

**Endpoints**:
- `GET /health`: Health check
- `POST /api/scan`: Initiate scan
- `GET /api/scans`: List scans
- `GET /api/scans/<id>`: Get scan details
- `POST /api/analyze/<id>`: Analyze scan
- `POST /api/report/<id>`: Generate report
- `GET /api/vulnerabilities/<id>`: Get vulnerabilities
- `POST /api/templates/update`: Update templates

**Dependencies**: Flask, flask-cors, core modules

---

### CLI Module

#### `src/spectra_cli.py`
**Purpose**: Command-line interface

**Commands**:
- `scan <target>`: Run vulnerability scan
- `list`: List recent scans
- `show <scan_id>`: Show scan details
- `update`: Update Nuclei templates

**Features**:
- Argparse-based command parsing
- Colored output
- Progress indicators
- Error handling

**Dependencies**: argparse, core modules

---

## Configuration Files

### `config/config.yaml`
Main configuration file with sections for:
- Scanner settings (rate limits, timeouts)
- AI analyzer settings (API URL, model)
- Reporter settings (output formats)
- Database settings
- API settings (host, port, CORS)
- Logging settings
- Security settings (whitelists, API keys)

### `.env`
Environment variables:
- `LLAMA_API_URL`: Ollama API endpoint
- `LLAMA_MODEL`: AI model name
- `API_HOST`, `API_PORT`: API server config
- `DATABASE_PATH`: Database location
- `LOG_LEVEL`: Logging level

---

## Data Flow

### Scanning Workflow

```
1. User Request
   ↓
2. NucleiScanner.scan_target()
   ↓
3. Execute Nuclei command
   ↓
4. Parse JSON results
   ↓
5. Database.save_scan()
   ↓
6. AIAnalyzer.analyze_vulnerabilities()
   ↓
7. Query Ollama/Llama
   ↓
8. Calculate risk score
   ↓
9. Generate recommendations
   ↓
10. Database.save_analysis()
    ↓
11. ReportGenerator.generate_report()
    ↓
12. Save report files
    ↓
13. Database.save_report()
    ↓
14. Return results to user
```

### API Request Flow

```
HTTP Request
   ↓
Flask Route Handler
   ↓
Input Validation
   ↓
Core Module Call
   ↓
Database Operation
   ↓
JSON Response
```

---

## File Naming Conventions

### Scan Results
- Format: `scan_YYYYMMDD_HHMMSS.json`
- Location: `data/scans/`
- Example: `scan_20240115_143022.json`

### Reports
- Format: `report_YYYYMMDD_HHMMSS.<ext>`
- Location: `data/reports/`
- Extensions: `.html`, `.json`, `.md`
- Example: `report_20240115_143600.html`

### Logs
- Format: `spectra.log`
- Location: `logs/`
- Rotation: Configured in config.yaml

### Database
- Format: `spectra.db`
- Location: `data/`
- Type: SQLite 3

---

## Dependencies

### Core Dependencies
- **Flask**: Web framework for API
- **flask-cors**: CORS support
- **requests**: HTTP client for Ollama
- **pyyaml**: YAML configuration parsing
- **sqlite3**: Database (built-in)

### External Tools
- **Nuclei**: Vulnerability scanner
- **Ollama**: Local AI inference
- **Llama**: AI model

### Development Dependencies
- **pytest**: Testing framework
- **pytest-cov**: Coverage reporting
- **black**: Code formatting
- **flake8**: Linting

---

## Database Schema

### `scans` Table
```sql
CREATE TABLE scans (
    scan_id TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    vulnerabilities_count INTEGER DEFAULT 0,
    risk_score REAL DEFAULT 0,
    scan_data TEXT
);
```

### `vulnerabilities` Table
```sql
CREATE TABLE vulnerabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL,
    template_id TEXT,
    name TEXT,
    severity TEXT,
    matched_at TEXT,
    vulnerability_data TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
);
```

### `reports` Table
```sql
CREATE TABLE reports (
    report_id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL,
    format TEXT,
    file_path TEXT,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
);
```

### `analysis` Table
```sql
CREATE TABLE analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL,
    ai_analysis TEXT,
    recommendations TEXT,
    risk_score REAL,
    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scan_id) REFERENCES scans(scan_id)
);
```

---

## Extension Points

### Adding New Scanners
1. Create new scanner class in `src/core/scanner/`
2. Implement common interface
3. Update scanner selection logic
4. Add configuration options

### Adding New AI Models
1. Update `AIAnalyzer` class
2. Add model-specific API calls
3. Update configuration
4. Test compatibility

### Adding Report Formats
1. Add generation method to `ReportGenerator`
2. Implement format-specific logic
3. Update CLI and API
4. Add format to documentation

### Custom Templates
1. Place templates in `data/templates/`
2. Configure path in config.yaml
3. Use with `-t` flag in Nuclei

---

## Testing Structure

### Unit Tests (`tests/unit/`)
- Test individual functions
- Mock external dependencies
- Fast execution

### Integration Tests (`tests/integration/`)
- Test module interactions
- Use test database
- Real API calls (optional)

---

## Logging

### Log Levels
- **DEBUG**: Detailed diagnostic information
- **INFO**: General informational messages
- **WARNING**: Warning messages
- **ERROR**: Error messages
- **CRITICAL**: Critical issues

### Log Format
```
%(asctime)s - %(name)s - %(levelname)s - %(message)s
```

### Log Locations
- Console output (CLI)
- File: `logs/spectra.log`
- Rotation based on size/time

---

## Security Considerations

### Input Validation
- URL validation
- Parameter sanitization
- SQL injection prevention (parameterized queries)

### Access Control
- Optional API key authentication
- Target whitelisting/blacklisting
- Rate limiting

### Data Protection
- Secure storage of scan results
- No credentials in logs
- Database encryption (optional)

---

This structure provides a scalable, maintainable foundation for the Spectra penetration testing service.
