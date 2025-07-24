import React from 'react';
import { Navbar, Container, Form } from 'react-bootstrap';

const Header = ({ theme, toggleTheme, wrapTextEnabled, toggleWrapText }) => {
  return (
    <>
      <Navbar expand="lg" fixed="top" className="custom-header">
        <Container fluid className="header-container">
          <Navbar.Brand href="#" style={{ fontWeight: '900', fontSize: '1.5rem' }}>{`{ JSON Tools }`}</Navbar.Brand>
          <Form className="d-flex align-items-center theme-toggle-group">
            <span className="theme-label">Light</span>
            <Form.Check 
              type="switch"
              id="theme-switch"
              label={<span className="theme-label">Dark</span>}
              checked={theme === 'dark'}
              onChange={toggleTheme}
              style={{ color: 'white' }}
            />
          </Form>
        </Container>
      </Navbar>
      </>
  );
};

export default Header;
