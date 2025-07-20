import React from 'react';
import { Navbar, Container, Form } from 'react-bootstrap';

const Header = ({ theme, toggleTheme, wrapTextEnabled, toggleWrapText }) => {
  return (
    <>
      <Navbar expand="lg" fixed="top" className="custom-header">
        <Container fluid className="header-container">
          <Navbar.Brand href="#" style={{ fontWeight: '900', fontSize: '1.5rem' }}>{`{ JSON Tools }`}</Navbar.Brand>
          <Form className="d-flex align-items-center">
            <span style={{ color: 'white', marginRight: '8px' }}>Light</span>
            <Form.Check 
              type="switch"
              id="theme-switch"
              label="Dark"
              checked={theme === 'dark'}
              onChange={toggleTheme}
              style={{ color: 'white' }} /* Apply color directly to the switch label */
            />
          </Form>
        </Container>
      </Navbar>
      </>
  );
};

export default Header;
